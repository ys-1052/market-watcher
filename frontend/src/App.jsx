import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Info,
  ShieldAlert,
  LogOut,
  KeyRound,
} from 'lucide-react';
import DashboardTabs from './components/DashboardTabs';
import StockCard from './components/StockCard';
import SearchBar from './components/SearchBar';
import DetailModal from './components/DetailModal';

const SECTOR_TRANSLATIONS = {
  Technology: 'ハイテク / IT',
  'Financial Services': '金融 / 銀行',
  'Consumer Cyclical': '一般消費財 / 自動車',
  'Communication Services': '通信 / メディア',
  Healthcare: 'ヘルスケア / 医薬品',
  Industrials: '製造業 / 機械',
  Energy: 'エネルギー / 石油',
  'Basic Materials': '素材 / 化学',
  'Real Estate': '不動産',
  Utilities: 'インフラ / 電力',
  'Consumer Defensive': '生活必需品',
  Other: 'その他',
  'Other (データ取得エラー)': 'その他',
};

const getSectorLabel = (sector) => SECTOR_TRANSLATIONS[sector] || sector;

const App = () => {
  // ユーザー認証ステート
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('market_watcher_user') || '');
  const [authInput, setAuthInput] = useState('');
  const [authError, setAuthError] = useState('');

  // ダッシュボード・株価ステート
  const [dashboards, setDashboards] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [stocksData, setStocksData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // モーダル・インタラクション用ステート
  const [selectedStock, setSelectedStock] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [filterType, setFilterType] = useState('ALL');
  const [activeSector, setActiveSector] = useState('ALL');

  // アクティブなダッシュボードが切り替わった時にセクターフィルターをリセット
  useEffect(() => {
    setActiveSector('ALL');
  }, [activeId]);

  // 1. ダッシュボード一覧の取得
  useEffect(() => {
    if (currentUser) {
      fetchDashboards();
    }
  }, [currentUser]);

  // 2. アクティブなダッシュボードが切り替わった時に株価を取得
  useEffect(() => {
    if (activeId) {
      const activeDash = dashboards.find((d) => d.DashboardId === activeId);
      if (activeDash && activeDash.Tickers.length > 0) {
        // 現在ロードされているデータと順番・中身が完全に一致している場合はリロードを防ぐ（ドラッグドロップ時のラグ回避）
        const currentTickers = stocksData.map((s) => s.symbol.toUpperCase());
        const dashTickers = activeDash.Tickers.map((t) => t.toUpperCase());
        const isSameOrder =
          currentTickers.length === dashTickers.length &&
          currentTickers.every((val, index) => val === dashTickers[index]);
        if (!isSameOrder) {
          fetchStockPrices(activeDash.Tickers);
        }
      } else {
        setStocksData([]);
      }
    }
  }, [activeId, dashboards]);

  // バックエンド通信時の共通ヘッダー（ユーザー特定用トークン）
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentUser}`,
    };
  };

  const fetchDashboards = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/dashboards', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        // バックエンドのDynamoDBデータ構造（Name, Tickers, DashboardId）に合わせる
        setDashboards(data);
        if (data.length > 0) {
          // 前回のアクティブIDを引き継ぐか、最初のタブを選択
          setActiveId((prev) => {
            const exists = data.some((d) => d.DashboardId === prev);
            return exists ? prev : data[0].DashboardId;
          });
        }
      }
    } catch (e) {
      console.error('Error fetching dashboards:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStockPrices = async (tickers, isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const tickersParam = tickers.join(',');
      const res = await fetch(`/api/stocks?tickers=${encodeURIComponent(tickersParam)}`);
      if (res.ok) {
        const data = await res.json();

        // 元のtickersの並び順（ドラッグ＆ドロップで保存した順序）を厳密に維持してセット
        const orderedData = tickers
          .map((sym) => data.find((stock) => stock.symbol.toUpperCase() === sym.toUpperCase()))
          .filter(Boolean);

        setStocksData(orderedData);
      }
    } catch (e) {
      console.error('Error fetching stock prices:', e);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  // 3. ティッカーの追加
  const handleAddTicker = async (symbol) => {
    const activeDash = dashboards.find((d) => d.DashboardId === activeId);
    if (!activeDash) return;

    const cleanSymbol = symbol.trim().toUpperCase();
    if (activeDash.Tickers.includes(cleanSymbol)) {
      alert('この銘柄は既に登録されています。');
      return;
    }

    // 即座にローディング表示をオンにして追加プレースホルダーを表示させる
    setIsLoading(true);

    const updatedTickers = [...activeDash.Tickers, cleanSymbol];

    // バックエンドのダッシュボードを更新
    try {
      const res = await fetch(`/api/dashboards/${activeId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: activeDash.Name,
          tickers: updatedTickers,
        }),
      });

      if (res.ok) {
        // ローカルステートを更新してUIを再描画
        setDashboards((prev) =>
          prev.map((d) => (d.DashboardId === activeId ? { ...d, Tickers: updatedTickers } : d))
        );
      } else {
        setIsLoading(false);
      }
    } catch (e) {
      console.error('Error adding ticker:', e);
      setIsLoading(false);
    }
  };

  // 4. ティッカーの削除
  const handleRemoveTicker = async (symbol) => {
    const activeDash = dashboards.find((d) => d.DashboardId === activeId);
    if (!activeDash) return;

    const updatedTickers = activeDash.Tickers.filter((t) => t !== symbol);

    try {
      const res = await fetch(`/api/dashboards/${activeId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: activeDash.Name,
          tickers: updatedTickers,
        }),
      });

      if (res.ok) {
        setDashboards((prev) =>
          prev.map((d) => (d.DashboardId === activeId ? { ...d, Tickers: updatedTickers } : d))
        );
      }
    } catch (e) {
      console.error('Error removing ticker:', e);
    }
  };

  // 手動更新ボタンクリック
  const handleManualRefresh = () => {
    const activeDash = dashboards.find((d) => d.DashboardId === activeId);
    if (activeDash && activeDash.Tickers.length > 0) {
      fetchStockPrices(activeDash.Tickers, true);
    }
  };

  // 5. 新規ダッシュボード作成
  const handleCreateDashboard = async (name) => {
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: name,
          tickers: [],
        }),
      });
      if (res.ok) {
        const newDash = await res.json();
        setDashboards((prev) => [...prev, newDash]);
        setActiveId(newDash.DashboardId);
      }
    } catch (e) {
      console.error('Error creating dashboard:', e);
    }
  };

  // 6. ダッシュボードの削除
  const handleDeleteDashboard = async (dashboardId) => {
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDashboards((prev) => prev.filter((d) => d.DashboardId !== dashboardId));
      }
    } catch (e) {
      console.error('Error deleting dashboard:', e);
    }
  };

  // ==========================================================================
  // Drag and Drop 並び替えロジック
  // ==========================================================================

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    // onDragOverは必須（ドロップ可能エリアにするため）
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleDrop = async (e, dropIndex) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const activeDash = dashboards.find((d) => d.DashboardId === activeId);
    if (!activeDash) return;

    // 1. Tickers 配列の並び替え（ドラッグした銘柄をターゲット銘柄の直前（左側）に挿入）
    const reorderedTickers = [...activeDash.Tickers];
    const draggedItem = reorderedTickers[draggedIndex];
    const targetTicker = reorderedTickers[dropIndex];
    const remainingTickers = reorderedTickers.filter((_, idx) => idx !== draggedIndex);
    const targetIndexInRemaining = remainingTickers.indexOf(targetTicker);
    remainingTickers.splice(targetIndexInRemaining, 0, draggedItem);

    // 2. stocksData 配列の並び替え（ローカルUIステートを同期）
    const reorderedStocksData = [...stocksData];
    const draggedStock = reorderedStocksData[draggedIndex];
    const targetStock = reorderedStocksData[dropIndex];
    const remainingStocksData = reorderedStocksData.filter((_, idx) => idx !== draggedIndex);
    const targetStockIndexInRemaining = remainingStocksData.indexOf(targetStock);
    remainingStocksData.splice(targetStockIndexInRemaining, 0, draggedStock);

    // ローカルステートを即時更新してUIのガタつきを防ぐ
    setStocksData(remainingStocksData);
    setDashboards((prev) =>
      prev.map((d) => (d.DashboardId === activeId ? { ...d, Tickers: remainingTickers } : d))
    );

    // 3. バックエンドへ並び順を即座に保存
    try {
      const res = await fetch(`/api/dashboards/${activeId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: activeDash.Name,
          tickers: remainingTickers,
        }),
      });
      if (!res.ok) {
        // エラーの場合は再同期
        fetchDashboards();
      }
    } catch (e) {
      console.error('Error saving reordered tickers:', e);
      fetchDashboards();
    }
  };

  // ==========================================================================
  // 認証ログイン画面（招待制を模擬）
  // ==========================================================================

  const handleLogin = (e) => {
    e.preventDefault();
    if (!authInput.trim()) return;

    // 個人用の簡易ログインコード（例: 招待コードまたはユーザー名）
    // Cognito導入後は実際のトークンがLocalStorageに入ります
    const cleanUser = authInput.trim();
    localStorage.setItem('market_watcher_user', cleanUser);
    setCurrentUser(cleanUser);
    setAuthInput('');
    setAuthError('');
  };

  const handleLogout = () => {
    if (confirm('ログアウトしますか？')) {
      localStorage.removeItem('market_watcher_user');
      setCurrentUser('');
      setDashboards([]);
      setStocksData([]);
      setActiveId('');
    }
  };

  if (!currentUser) {
    return (
      <div className="modal-overlay" style={{ background: 'var(--bg-main)' }}>
        <div
          className="modal-wrapper"
          style={{ maxWidth: '400px', border: '1px solid rgba(255, 255, 255, 0.08)' }}
        >
          <div
            className="modal-header"
            style={{
              borderBottom: 'none',
              padding: '2rem 2rem 1rem 2rem',
              justifyContent: 'center',
            }}
          >
            <div className="logo-section" style={{ alignItems: 'center' }}>
              <h1 style={{ fontSize: '2rem' }}>
                <span className="logo-text">Market Watcher</span>
              </h1>
            </div>
          </div>

          <form
            onSubmit={handleLogin}
            className="dialog-form"
            style={{ padding: '0 2rem 2rem 2rem' }}
          >
            <div className="form-group">
              <label
                className="form-label"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <KeyRound size={14} className="text-muted" />
                <span>ユーザー名</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="ユーザー名を入力してください"
                value={authInput}
                onChange={(e) => setAuthInput(e.target.value)}
                autoFocus
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                登録済みのユーザー名を入力してログインしてください。ユーザー名ごとに個別のウォッチリストが安全に保存・管理されます。
              </span>
            </div>

            {authError && (
              <div
                className="market-status closed"
                style={{ justifyContent: 'center', color: 'var(--accent-red)' }}
              >
                <ShieldAlert size={14} />
                <span>{authError}</span>
              </div>
            )}
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              ダッシュボードに入る
            </button>
          </form>
        </div>
      </div>
    );
  }

  const viewMode = activeSector === 'ALL' ? 'group' : 'grid';

  return (
    <div className="app-container">
      {isLoading && <div className="top-loading-bar" />}
      {/* 1. アプリケーションヘッダー */}
      <header className="app-header">
        <div className="logo-section">
          <h1>
            <span className="logo-text">Market Watcher</span>
          </h1>
        </div>

        <div className="header-actions">
          {currentUser && (
            <span
              className="user-badge"
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                marginRight: '0.5rem',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <span>👤</span>
              <strong>{currentUser}</strong>
            </span>
          )}
          <div className="market-status open">
            <span className="pulse-dot"></span>
            <span>Market Active</span>
          </div>
          <button
            className={`btn-icon ${isRefreshing ? 'spinning' : ''}`}
            onClick={handleManualRefresh}
            title="株価を更新"
            disabled={isLoading || isRefreshing || stocksData.length === 0}
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="btn-icon"
            onClick={handleLogout}
            title="ログアウト"
            style={{ color: 'var(--text-secondary)' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* 2. コントロールパネル（ダッシュボードタブと検索バー） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <DashboardTabs
          dashboards={dashboards}
          activeId={activeId}
          onChangeTab={setActiveId}
          onCreateTab={handleCreateDashboard}
          onDeleteTab={handleDeleteDashboard}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <SearchBar onAddTicker={handleAddTicker} />
        </div>
      </div>

      {/* 3. 株価フィルターとグリッドコントロール */}
      {stocksData.length > 0 && (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}
        >
          {/* A. 国・地域別フィルター */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div className="filter-segmented-control">
              <button
                className={`filter-btn ${filterType === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setFilterType('ALL');
                  setActiveSector('ALL');
                }}
              >
                すべて ({stocksData.length})
              </button>
              <button
                className={`filter-btn ${filterType === 'US' ? 'active' : ''}`}
                onClick={() => {
                  setFilterType('US');
                  setActiveSector('ALL');
                }}
              >
                米国株 (
                {stocksData.filter((s) => !s.symbol.endsWith('.T') && s.currency !== 'JPY').length})
              </button>
              <button
                className={`filter-btn ${filterType === 'JP' ? 'active' : ''}`}
                onClick={() => {
                  setFilterType('JP');
                  setActiveSector('ALL');
                }}
              >
                日本株 (
                {stocksData.filter((s) => s.symbol.endsWith('.T') || s.currency === 'JPY').length})
              </button>
            </div>
          </div>

          {/* B. 分類・テーマフィルター (単一統合型) */}
          {(() => {
            // 現在の国・地域フィルターに合致する銘柄のセクターを集計
            const currentFilteredList = stocksData.filter((stock) => {
              if (filterType === 'US')
                return !stock.symbol.endsWith('.T') && stock.currency !== 'JPY';
              if (filterType === 'JP')
                return stock.symbol.endsWith('.T') || stock.currency === 'JPY';
              return true;
            });
            const uniqueSectors = Array.from(
              new Set(currentFilteredList.map((s) => s.sector).filter(Boolean))
            );

            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  padding: '0.25rem 0',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  分類・テーマ:
                </span>
                <button
                  className={`sector-tag ${activeSector === 'ALL' ? 'active' : ''}`}
                  onClick={() => setActiveSector('ALL')}
                >
                  すべて
                </button>
                <button
                  className={`sector-tag ${activeSector === 'CUSTOM' ? 'active' : ''}`}
                  onClick={() => setActiveSector('CUSTOM')}
                >
                  カスタム
                </button>
                {uniqueSectors.map((sector) => {
                  const count = currentFilteredList.filter((s) => s.sector === sector).length;
                  return (
                    <button
                      key={sector}
                      className={`sector-tag ${activeSector === sector ? 'active' : ''}`}
                      onClick={() => setActiveSector(sector)}
                    >
                      {getSectorLabel(sector)} ({count})
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* 4. 株価カードグリッド（ドラッグ＆ドロップ対応） */}
      {isLoading && stocksData.length === 0 ? (
        (() => {
          const activeDash = dashboards.find((d) => d.DashboardId === activeId);
          const skeletonCount = activeDash ? activeDash.Tickers.length : 4;
          return (
            <div className="stock-grid">
              {Array.from({ length: skeletonCount }).map((_, index) => (
                <div key={index} className="stock-card skeleton" style={{ height: '170px' }} />
              ))}
            </div>
          );
        })()
      ) : stocksData.length > 0 ? (
        (() => {
          const activeDash = dashboards.find((d) => d.DashboardId === activeId);
          const isAddingStock =
            activeDash && activeDash.Tickers.length > stocksData.length && isLoading;

          const filteredStocks = stocksData.filter((stock) => {
            // A. 国・地域別フィルター
            if (filterType === 'US' && (stock.symbol.endsWith('.T') || stock.currency === 'JPY')) {
              return false;
            }
            if (filterType === 'JP' && !stock.symbol.endsWith('.T') && stock.currency !== 'JPY') {
              return false;
            }
            // B. セクターフィルター (グリッド表示のときのみ適用。ただし CUSTOM モードのときは全表示)
            if (
              viewMode === 'grid' &&
              activeSector !== 'ALL' &&
              activeSector !== 'CUSTOM' &&
              stock.sector !== activeSector
            ) {
              return false;
            }
            return true;
          });

          if (filteredStocks.length === 0 && !isAddingStock) {
            return (
              <div className="empty-watchlist" style={{ padding: '3rem 2rem' }}>
                <p>選択したカテゴリーに登録されている銘柄はありません。</p>
              </div>
            );
          }

          // テーマ別グループ表示モードの場合
          if (viewMode === 'group') {
            const groupedBySector = filteredStocks.reduce((acc, stock) => {
              const sector = stock.sector || 'Other';
              if (!acc[sector]) acc[sector] = [];
              acc[sector].push(stock);
              return acc;
            }, {});

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                {Object.entries(groupedBySector).map(([sector, stocks]) => (
                  <div key={sector} className="sector-group-container">
                    <h3 className="sector-group-header">
                      <span className="sector-badge">{getSectorLabel(sector)}</span>
                    </h3>
                    <div className="stock-grid">
                      {stocks.map((stock) => {
                        const realIndex = stocksData.findIndex((s) => s.symbol === stock.symbol);
                        return (
                          <StockCard
                            key={stock.symbol}
                            stock={stock}
                            index={realIndex}
                            onRemove={handleRemoveTicker}
                            onClick={setSelectedStock}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}

                {isAddingStock && (
                  <div className="sector-group-container" style={{ opacity: 0.6 }}>
                    <h3 className="sector-group-header">
                      <span
                        className="sector-badge"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        追加中...
                      </span>
                    </h3>
                    <div className="stock-grid">
                      <div className="stock-card skeleton" style={{ height: '170px' }} />
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // 通常のグリッド表示モードの場合
          return (
            <div className="stock-grid">
              {filteredStocks.map((stock) => {
                const realIndex = stocksData.findIndex((s) => s.symbol === stock.symbol);
                const isCustomMode = activeSector === 'CUSTOM';
                return (
                  <StockCard
                    key={stock.symbol}
                    stock={stock}
                    index={realIndex}
                    onRemove={handleRemoveTicker}
                    onClick={setSelectedStock}
                    onDragStart={isCustomMode ? handleDragStart : null}
                    onDragOver={isCustomMode ? handleDragOver : null}
                    onDragEnd={isCustomMode ? handleDragEnd : null}
                    onDrop={isCustomMode ? handleDrop : null}
                    draggedIndex={draggedIndex}
                  />
                );
              })}
              {isAddingStock && (
                <div className="stock-card skeleton" style={{ height: '170px', opacity: 0.6 }} />
              )}
            </div>
          );
        })()
      ) : (
        <div className="empty-watchlist">
          <p>このダッシュボードには銘柄が登録されていません。</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-0.5rem' }}>
            上の検索バーからティッカーコードを入力して追加してください。
          </p>
        </div>
      )}

      {/* 4. 詳細ポップオーバーモーダル */}
      {selectedStock && (
        <DetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  );
};

export default App;
