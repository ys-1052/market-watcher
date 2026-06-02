import React, { useEffect, useRef, useState } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

const DetailModal = ({ stock, onClose }) => {
  const canvasRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const trend = stock.change > 0 ? 'up' : stock.change < 0 ? 'down' : 'neutral';
  const isJapanese = stock.symbol.endsWith('.T') || stock.currency === 'JPY';

  const formatLargeNumber = (num) => {
    if (!num) return '-';
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}兆`;
    if (num >= 1e8) return `${(num / 1e8).toFixed(2)}億`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}万`;
    return num.toLocaleString();
  };

  const formatPrice = (price) => {
    if (price === undefined || price === null) return '-';
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 7日間のヒストリカルチャート描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stock.sparkline || stock.sparkline.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const prices = stock.sparkline.map((item) => item.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min === 0 ? 1 : max - min;

    // 上下左右にマージンを作る
    const margin = { top: 20, right: 20, bottom: 30, left: 55 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const points = stock.sparkline.map((item, index) => {
      const x = margin.left + (index / (stock.sparkline.length - 1)) * chartWidth;
      const y = margin.top + chartHeight - ((item.price - min) / range) * chartHeight;
      return { x, y, ...item };
    });

    ctx.clearRect(0, 0, width, height);

    // 1. グリッド線とY軸目盛りの描画
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const val = min + (range / gridLines) * i;
      const y = margin.top + chartHeight - (i / gridLines) * chartHeight;

      // グリッド線
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();

      // 目盛り値
      ctx.fillText(formatPrice(val), margin.left - 10, y);
    }

    // 2. X軸の目盛り（日付）の描画
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const showLabels = [0, Math.floor(points.length / 2), points.length - 1];
    showLabels.forEach((index) => {
      if (points[index]) {
        const p = points[index];
        // 日付フォーマットをMM/DDに整形
        const dateStr = p.date.substring(5); // "YYYY-MM-DD" -> "MM-DD"
        ctx.fillText(dateStr.replace('-', '/'), p.x, margin.top + chartHeight + 10);
      }
    });

    // 3. グラデーションの描画
    const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#f43f5e' : '#9ca3af';
    const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
    gradient.addColorStop(
      0,
      trend === 'up'
        ? 'rgba(16, 185, 129, 0.2)'
        : trend === 'down'
          ? 'rgba(244, 63, 94, 0.2)'
          : 'rgba(156, 163, 175, 0.15)'
    );
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, margin.top + chartHeight);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, margin.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 4. トレンド線の描画
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 5. ホバー時のインタラクション描画
    if (hoverIndex !== null && points[hoverIndex]) {
      const activePoint = points[hoverIndex];

      // 垂直ガイドライン
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(activePoint.x, margin.top);
      ctx.lineTo(activePoint.x, margin.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]); // ダッシュ解除

      // アクティブな点
      ctx.beginPath();
      ctx.arc(activePoint.x, activePoint.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = trendColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // ツールチップ表示
      const tooltipText = `${activePoint.date}: ${formatPrice(activePoint.price)} ${stock.currency}`;
      ctx.font = 'bold 11px Inter';
      const textWidth = ctx.measureText(tooltipText).width;

      const tooltipX = Math.max(
        margin.left + 10,
        Math.min(width - margin.right - textWidth - 10, activePoint.x - textWidth / 2)
      );
      const tooltipY = activePoint.y - 25;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;

      // 角丸四角形
      const r = 4;
      ctx.beginPath();
      ctx.roundRect(tooltipX - 8, tooltipY - 6, textWidth + 16, 20, r);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(tooltipText, tooltipX, tooltipY - 2);
    }
  }, [stock.sparkline, hoverIndex]);

  // マウスの動きで最も近いインデックスを見つける
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !stock.sparkline || stock.sparkline.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const margin = { left: 55, right: 20 };
    const chartWidth = rect.width - margin.left - margin.right;

    // 最も近いデータ点のインデックスを計算
    const index = Math.round(((x - margin.left) / chartWidth) * (stock.sparkline.length - 1));

    if (index >= 0 && index < stock.sparkline.length) {
      setHoverIndex(index);
      setMousePos({ x, y });
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const metrics = stock.details || {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-wrapper" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-section">
            <div className="modal-title-row">
              <span className="modal-symbol">{stock.symbol}</span>
              {isJapanese && (
                <span
                  className="card-jp-badge"
                  style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                >
                  東証
                </span>
              )}
            </div>
            <span className="modal-name">{stock.name}</span>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-price-display">
            <span className="modal-price">
              {formatPrice(stock.price)}
              <span className="card-currency" style={{ fontSize: '1rem', marginLeft: '0.4rem' }}>
                {stock.currency}
              </span>
            </span>
            <div
              className={`card-trend modal-trend ${trend}`}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.95rem' }}
            >
              {trend === 'up' && <TrendingUp size={16} />}
              {trend === 'down' && <TrendingDown size={16} />}
              <span>
                {stock.change > 0 ? '+' : ''}
                {stock.change.toFixed(2)} ({stock.changePercent > 0 ? '+' : ''}
                {stock.changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Canvas チャート */}
          {stock.sparkline && stock.sparkline.length > 0 ? (
            <div>
              <h4
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.75rem',
                  fontWeight: 600,
                }}
              >
                直近7日間の株価推移
              </h4>
              <div
                className="modal-chart-placeholder"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <canvas
                  ref={canvasRef}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>
            </div>
          ) : (
            <div className="modal-chart-placeholder">
              <span className="text-muted">ヒストリカルデータは利用できません</span>
            </div>
          )}

          {/* 指標グリッド */}
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">始値</span>
              <span className="metric-value">{formatPrice(metrics.open)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">高値</span>
              <span className="metric-value">{formatPrice(metrics.dayHigh)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">安値</span>
              <span className="metric-value">{formatPrice(metrics.dayLow)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">出来高</span>
              <span className="metric-value">{formatLargeNumber(metrics.volume)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">時価総額</span>
              <span className="metric-value">{formatLargeNumber(metrics.marketCap)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">PER (実績)</span>
              <span className="metric-value">
                {metrics.trailingPE ? metrics.trailingPE.toFixed(2) : '-'}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">52週高値</span>
              <span className="metric-value">{formatPrice(metrics.fiftyTwoWeekHigh)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">52週安値</span>
              <span className="metric-value">{formatPrice(metrics.fiftyTwoWeekLow)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">前日終値</span>
              <span className="metric-value">{formatPrice(stock.prevClose)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailModal;
