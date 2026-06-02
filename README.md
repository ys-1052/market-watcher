# 📈 Market Watcher - リアルタイム株価ボード

リアルタイム株価を表示し、ユーザーごとに複数のテーマ別・市場別ウォッチリスト（ダッシュボード）を自由に変更・ドラッグ＆ドロップで並び替えができるWebアプリケーションです。

AWSのサーバーレスアーキテクチャ（S3 + CloudFront + Lambda + DynamoDB + Cognito）を活用した、高効率かつ低コストで運用可能な設計となっています。

---

## ✨ 主な機能

1. **マルチ・ダッシュボード（ウォッチリスト切り替え）**
   - 「テック株」「日本株主力」「高配当」など、任意のテーマごとにタブでダッシュボードを作成・切り替え・削除できます。
2. **自由な並び替え（ドラッグ＆ドロップ）**
   - 各銘柄カードをマウスドラッグ＆ドロップで直感的に並び替えられます。並び替えた順序は即座にデータベースに自動保存されます。
3. **日米株式のハイブリッドサポート**
   - 米国株（`AAPL`, `TSLA` など）のほか、日本株（`7203.T` など）の表示に対応。
   - **入力オートコンプリートアシスト**: 検索バーに `7203` のような数字4桁を入力した場合、東証コードである `.T` を自動で補完して候補表示します。
4. **軽量・高品質なインタラクティブ折れ線チャート**
   - 外部の大規模チャートライブラリを使用せず、HTML5 Canvasをフル活用した滑らかで美しい折れ線グラフ（スパークライン）を描画。
   - 詳細モーダルでは、マウスカーソルを合わせると価格を追従表示する「クロスヘアガイド（照準器）」機能付きのインタラクティブチャートを実装。
5. **ポータブルなローカルDB接続設計**
   - ローカル起動時、Docker（DynamoDB Local）が立ち上がっていれば自動で接続します。
   - Dockerが立ち上がっていない場合、**自動的にローカルの SQLite ファイル (`backend/watchlist.db`) にフォールバック**してデータベースをシームレスに立ち上げます。これにより、複雑な環境構築なしで即座に開発・テストが可能です。

---

## 🛠️ 技術スタック

- **フロントエンド**: Vite + React + Vanilla CSS (HTML5 Semantic)
- **バックエンド**: Python 3.12+ + FastAPI + `mangum` (Lambda用)
- **データベース**: Amazon DynamoDB (AWS) / SQLite (ローカル自動フォールバック)
- **インフラデプロイ**: AWS SAM (Serverless Application Model)

---

## 🚀 ローカル起動手順

ローカル環境では、フロントエンド（ポート `5173`）とバックエンド（ポート `8080`）をそれぞれ起動します。フロントエンドは自動でバックエンドへAPIプロキシを行います。

### 💡 最も簡単な同時起動方法 (Makefile)
プロジェクトのルートディレクトリで以下のコマンドを実行するだけで、フロントエンドとバックエンドの両サーバーが同時に起動します。
```bash
make dev
```
起動完了後、[http://localhost:5173](http://localhost:5173) にブラウザでアクセスしてください。

---

### 1. バックエンド (FastAPI) の個別起動

```bash
# プロジェクトルートに移動
cd /Users/ytakahashi/app/market-watcher

# 仮想環境の作成
python3 -m venv venv
source venv/bin/activate

# 依存パッケージのインストール
pip install -r backend/requirements.txt

# バックエンドサーバーの起動 (自動リロード有効、ポート 8080)
AWS_ENV=local uvicorn backend.main:app --port 8080 --reload
```
- バックエンドが起動すると、自動的にローカルDB（DynamoDB Local、またはSQLiteファイル）が初期化されます。
- `http://127.0.0.1:8080/docs` にアクセスすると、FastAPI自動生成の Swagger UI API仕様書を確認・テストできます。

> **💡 DynamoDB Local (Docker) を利用したい場合**
> Dockerがインストールされている場合は、別のターミナルで `docker compose up -d` を実行するだけでポート `8000` に DynamoDB Local が起動し、バックエンドがSQLiteから自動的にDynamoDB Localへと切り替わります（ポートが分かれているため、FastAPI側と競合・デッドロックしません）。

---

### 2. フロントエンド (Vite + React) の起動

```bash
# 別のターミナルを開き、フロントエンドフォルダへ移動
cd /Users/ytakahashi/app/market-watcher/frontend

# 依存パッケージのインストール
npm install

# 開発用サーバーの起動
npm run dev
```

起動後、ブラウザで [http://localhost:5173](http://localhost:5173) にアクセスしてください。
- ログイン画面が表示されます。任意のユーザー名（例: `guest`, `admin` など）を入力してログインしてください。
- ユーザー名ごとに個別のダッシュボードがDBに自動作成され、マルチユーザーでの利用に対応しています。

---

## ☁️ AWSへのデプロイ手順

AWS上に本番インフラを構築する手順です。

### 1. バックエンド ＆ 基礎インフラのデプロイ (AWS SAM)

事前に [AWS CLI](https://aws.amazon.com/cli/) および [AWS SAM CLI](https://aws.amazon.com/serverless/sam/) をセットアップし、適切な認証情報を設定しておきます。

```bash
# プロジェクトルートに移動
cd /Users/ytakahashi/app/market-watcher

# SAM ビルドの実行 (Lambdaパッケージング)
sam build

# SAM デプロイの実行 (初回は --guided を推奨)
sam deploy --guided
```
デプロイ完了後、ターミナルの出力（Outputs）に以下の情報が表示されます。
- `CloudFrontUrl` (フロントエンドの公開URL)
- `ApiUrl` (API GatewayのエンドポイントURL)
- `CognitoUserPoolId` (ユーザープールID)
- `CognitoClientId` (クライアントID)

---

### 2. 招待ユーザー（ログインアカウント）の作成

管理者がAWS管理画面、または以下のAWS CLIコマンドからメールアドレスを指定してユーザーを招待します。

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username <email_address> \
  --user-attributes Name=email,Value=<email_address>
```
- コマンドを実行すると、招待されたユーザー宛てに初期（一時）パスワードが記載された招待メールが届きます。
- 初回ログイン時に、本パスワードの作成を求められます。

---

### 3. フロントエンドのビルド ＆ デプロイ

#### A. エンドポイントの書き換え
フロントエンドビルドの前に、環境変数ファイルを準備します：
`frontend/.env.production` を新規作成し、以下を設定します。
```env
VITE_API_BASE_URL=https://<HttpApiId>.execute-api.<region>.amazonaws.com
```

> ※ 本番コード側では、`fetch('/api/...')` を `fetch(import.meta.env.VITE_API_BASE_URL + '/api/...')` のように繋げることで環境別のAPIサーバー切り替えに対応できます。

#### B. ビルド ＆ S3アップロード
```bash
# frontend フォルダへ移動
cd frontend

# 静的ファイルのビルド
npm run build

# ビルド成果物 (dist フォルダ) を S3 にアップロード
aws s3 sync dist/ s3://<s3_bucket_name> --delete

# CloudFront のキャッシュをクリア（即時反映させるため）
aws cloudfront create-invalidation --distribution-id <cloudfront_distribution_id> --paths "/*"
```

デプロイ完了後、`CloudFrontUrl` のアドレスにブラウザからアクセスし、Cognitoで招待したメールアドレスと一時パスワードを使って安全にログインができるようになります。
