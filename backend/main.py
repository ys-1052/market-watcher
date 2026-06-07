import os
import requests
from typing import List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
from mangum import Mangum

from .database import init_db, get_dashboards, get_dashboard, save_dashboard, delete_dashboard

# ダミーのログインユーザー（個人利用のため固定値またはCognito連携）
DEFAULT_USER_ID = "personal_user"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリ起動時にDynamoDBテーブルの初期化を実行
    init_db()
    yield


app = FastAPI(
    title="Market Watcher API",
    description="リアルタイム株価とウォッチリスト管理API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORSの設定（ローカルフロントエンドからの接続を許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では特定のオリジンに制限することを推奨
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydanticモデルの定義
class DashboardCreate(BaseModel):
    name: str
    tickers: List[str]


class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    tickers: List[str]


# 認証ヘルパー（将来的にCognito JWT検証に置き換え可能）
def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """
    リクエストヘッダーからユーザーを特定する。
    個人利用のフェーズでは簡略化し、ヘッダーがない場合もDEFAULT_USER_IDを返します。
    """
    if not authorization:
        return DEFAULT_USER_ID
    # ベアラートークンの簡易解析
    if authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        # ローカルデバッグ用または特定のトークンがあればそれをユーザー名とする
        if token != "null" and token != "undefined" and len(token) > 0:
            return token
    return DEFAULT_USER_ID


# --- 1. 株価取得・検索エンドポイント ---


@app.get("/api/stocks")
def get_stock_data(tickers: str):
    """
    カンマ区切りのティッカーリスト（例: AAPL,MSFT,7203.T）を受け取り、
    リアルタイム価格、前日比、および直近7日間の履歴（スパークライン用）を取得して返却します。
    """
    if not tickers:
        return []

    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    result = []

    for symbol in ticker_list:
        try:
            ticker = yf.Ticker(symbol)

            # 直近7日間の履歴データを取得（スパークライン折れ線用）
            # インターバルを1日に設定し、十分なデータを確保
            hist = ticker.history(period="7d", interval="1d")

            sparkline_data = []
            if not hist.empty:
                for date, row in hist.iterrows():
                    sparkline_data.append({"date": date.strftime("%Y-%m-%d"), "price": round(float(row["Close"]), 2)})

            # yfinanceのinfoから詳細情報を取得
            # infoは呼び出しに時間がかかることがあるため、フォールバックを豊富に用意
            info = {}
            try:
                info = ticker.info
            except Exception as info_err:
                print(f"Error fetching info for {symbol}: {info_err}")

            # 最新の終値と前日終値を取得
            current_price = None
            prev_close = None

            if not hist.empty:
                # 履歴の最後の行を最新価格として使用（リアルタイム性の補完）
                current_price = round(float(hist["Close"].iloc[-1]), 2)
                if len(hist) > 1:
                    prev_close = round(float(hist["Close"].iloc[-2]), 2)

            # infoからより正確なリアルタイムデータを上書き（取得できれば）
            if info:
                current_price = info.get("regularMarketPrice") or info.get("currentPrice") or current_price
                prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose") or prev_close

            # 各値がどうしても取得できない場合のデフォルト処理
            if current_price is None:
                current_price = 0.0
            if prev_close is None:
                prev_close = current_price

            # 変動値と変動率の計算
            change = round(current_price - prev_close, 2)
            change_percent = round((change / prev_close) * 100, 2) if prev_close != 0 else 0.0

            # 表示用名称の取得
            company_name = info.get("shortName") or info.get("longName") or symbol

            # 日本株の判定（末尾が .T の場合や、通貨が JPY の場合）
            is_japanese = symbol.endswith(".T") or info.get("currency") == "JPY"
            currency = "JPY" if is_japanese else (info.get("currency") or "USD")

            result.append(
                {
                    "symbol": symbol,
                    "name": company_name,
                    "price": current_price,
                    "prevClose": prev_close,
                    "change": change,
                    "changePercent": change_percent,
                    "currency": currency,
                    "sparkline": sparkline_data,
                    "sector": info.get("sector") or "Other",
                    "industry": info.get("industry") or "Other",
                    "details": {
                        "open": info.get("regularMarketOpen")
                        or info.get("open")
                        or (hist["Open"].iloc[-1] if not hist.empty else None),
                        "dayHigh": info.get("regularMarketDayHigh")
                        or info.get("dayHigh")
                        or (hist["High"].iloc[-1] if not hist.empty else None),
                        "dayLow": info.get("regularMarketDayLow")
                        or info.get("dayLow")
                        or (hist["Low"].iloc[-1] if not hist.empty else None),
                        "volume": info.get("regularMarketVolume")
                        or info.get("volume")
                        or (int(hist["Volume"].iloc[-1]) if not hist.empty else None),
                        "marketCap": info.get("marketCap"),
                        "trailingPE": info.get("trailingPE"),
                        "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
                        "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
                    },
                }
            )

        except Exception as e:
            print(f"Error fetching data for ticker {symbol}: {e}")
            # エラー時もカードとして一覧から消えないようにプレースホルダーを返す
            result.append(
                {
                    "symbol": symbol,
                    "name": f"{symbol} (データ取得エラー)",
                    "price": 0.0,
                    "prevClose": 0.0,
                    "change": 0.0,
                    "changePercent": 0.0,
                    "currency": "USD",
                    "sparkline": [],
                    "sector": "Other",
                    "industry": "Other",
                    "error": True,
                }
            )

    return result


def translate_japanese_to_english(text: str) -> str:
    """
    日本語のクエリを英語に翻訳します。Google Translateの無料APIを使用します。
    """
    try:
        import urllib.parse

        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q={urllib.parse.quote(text)}"  # noqa: E501
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"  # noqa: E501
        }
        res = requests.get(url, headers=headers, timeout=2)
        if res.status_code == 200:
            data = res.json()
            if data and len(data) > 0 and data[0] and len(data[0]) > 0:
                translated = data[0][0][0]
                return translated.strip()
    except Exception as e:
        print(f"Translation failed: {e}")
    return text


@app.get("/api/stocks/search")
def search_stocks(q: str):
    """
    株の検索（オートコンプリート）。Yahoo Financeの検索APIを利用して
    部分一致するティッカーシンボルと企業名を返却します。
    日本株コード（4桁の数字）の場合は、自動的に末尾に「.T」を付けて検索します。
    また、日本語が入力された場合は、自動的に英訳して検索し、日本株を優先ソートします。
    """
    if not q or len(q.strip()) == 0:
        return []

    query = q.strip()

    # 4桁の数字のみの場合は日本株とみなし、自動で .T を補完して検索
    if query.isdigit() and len(query) == 4:
        query_t = f"{query}.T"
    else:
        query_t = query

    try:
        import re

        # 日本語（ひらがな、カタカナ、漢字）が含まれているか判定
        is_ja = bool(re.search(r"[\u3040-\u30ff\u4e00-\u9faf]", query_t))

        queries_to_try = [query_t]
        if is_ja:
            translated = translate_japanese_to_english(query_t)
            if translated and translated.lower() != query_t.lower():
                queries_to_try.append(translated)

        url = "https://query1.finance.yahoo.com/v1/finance/search"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"  # noqa: E501
        }

        results_map = {}

        for q_term in queries_to_try:
            params = {"q": q_term, "quotesCount": 10, "newsCount": 0}
            if is_ja:
                params["lang"] = "ja-JP"
                params["region"] = "JP"

            response = requests.get(url, params=params, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json()
                quotes = data.get("quotes", [])
                for quote in quotes:
                    asset_type = quote.get("quoteType")
                    if asset_type in ["EQUITY", "ETF", "INDEX"]:
                        symbol = quote.get("symbol", "")
                        name = quote.get("shortname") or quote.get("longname") or symbol
                        exch = quote.get("exchange", "")

                        results_map[symbol] = {"symbol": symbol, "name": name, "exchange": exch, "type": asset_type}

        results = list(results_map.values())

        # もし4桁数字で、直接ヒットがなければ自前で .T のプレースホルダーも差し込む
        if query.isdigit() and len(query) == 4 and query_t not in results_map:
            results.insert(
                0, {"symbol": query_t, "name": f"日本株コード {query}.T (東証)", "exchange": "JPX", "type": "EQUITY"}
            )

        # 日本語検索、または .T 補完の場合のスコアリングソート
        # 日本語入力時は東証上場銘柄（.T）を最優先にする
        def get_sort_score(item):
            symbol = item["symbol"].upper()
            score = 0

            # クエリとの完全一致
            if symbol == query_t.upper() or symbol == query.upper():
                score += 200

            if is_ja:
                # 日本語で検索された場合は、東証上場銘柄を最優先
                if symbol.endswith(".T"):
                    score += 100
                elif item.get("exchange") in ["JPX", "TYO"]:
                    score += 80
            else:
                # 英語検索で日本株コード検索等の場合も .T を高評価
                if query.isdigit() and symbol.endswith(".T"):
                    score += 100

            return score

        results.sort(key=get_sort_score, reverse=True)
        return results

    except Exception as e:
        print(f"Search API error: {e}")
        # エラー時の最低限のフォールバック
        if query.isdigit() and len(query) == 4:
            return [{"symbol": query_t, "name": f"日本株コード {query}.T", "exchange": "JPX", "type": "EQUITY"}]
        return [{"symbol": query.upper(), "name": query.upper(), "exchange": "US", "type": "EQUITY"}]


# --- 2. ダッシュボード管理エンドポイント ---


@app.get("/api/dashboards")
def get_user_dashboards(user_id: str = Depends(get_current_user)):
    """
    ログインユーザーの全ダッシュボードを取得します。
    ダッシュボードが一つもない場合、初期のデフォルトダッシュボードを自動作成します。
    """
    dashboards = get_dashboards(user_id)

    if not dashboards:
        # デフォルトダッシュボードの自動作成（体験向上のため）
        default_tickers = ["AAPL", "MSFT", "NVDA", "6758.T", "7203.T", "8306.T"]
        default_dashboard = save_dashboard(
            user_id=user_id, dashboard_id="default", name="マイウォッチリスト", tickers=default_tickers
        )
        if default_dashboard:
            dashboards = [default_dashboard]

    return dashboards


@app.post("/api/dashboards")
def create_dashboard(data: DashboardCreate, user_id: str = Depends(get_current_user)):
    """
    新規ダッシュボードを作成します。
    """
    import uuid

    dashboard_id = str(uuid.uuid4())
    new_dashboard = save_dashboard(user_id=user_id, dashboard_id=dashboard_id, name=data.name, tickers=data.tickers)
    if not new_dashboard:
        raise HTTPException(status_code=500, detail="ダッシュボードの作成に失敗しました。")
    return new_dashboard


@app.put("/api/dashboards/{dashboard_id}")
def update_user_dashboard(dashboard_id: str, data: DashboardUpdate, user_id: str = Depends(get_current_user)):
    """
    既存ダッシュボードの銘柄順序（ドラッグ＆ドロップ用）や名称を更新します。
    """
    existing = get_dashboard(user_id, dashboard_id)
    if not existing:
        raise HTTPException(status_code=404, detail="ダッシュボードが見つかりません。")

    name = data.name if data.name is not None else existing.get("Name", "ウォッチリスト")
    updated = save_dashboard(user_id=user_id, dashboard_id=dashboard_id, name=name, tickers=data.tickers)
    if not updated:
        raise HTTPException(status_code=500, detail="ダッシュボードの更新に失敗しました。")
    return updated


@app.delete("/api/dashboards/{dashboard_id}")
def delete_user_dashboard(dashboard_id: str, user_id: str = Depends(get_current_user)):
    """
    ダッシュボードを削除します。
    """
    existing = get_dashboard(user_id, dashboard_id)
    if not existing:
        raise HTTPException(status_code=404, detail="ダッシュボードが見つかりません。")

    success = delete_dashboard(user_id, dashboard_id)
    if not success:
        raise HTTPException(status_code=500, detail="ダッシュボードの削除に失敗しました。")
    return {"message": "Dashboard deleted successfully"}


# AWS Lambda用ハンドラー (Mangum)
handler = Mangum(app)
