import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, GripVertical } from 'lucide-react';
import Sparkline from './Sparkline';

const StockCard = ({
  stock,
  index,
  onRemove,
  onClick,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  draggedIndex,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const trend = stock.change > 0 ? 'up' : stock.change < 0 ? 'down' : 'neutral';

  const handleDragStart = (e) => {
    if (!onDragStart) return;
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(e, index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (onDragOver) onDragOver(e, index);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    if (onDragStart && draggedIndex !== index) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    setIsDragOver(false);
    if (onDrop) onDrop(e, index);
  };

  const formatPrice = (price) => {
    if (price === undefined || price === null) return '0.00';
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatChange = (change) => {
    if (change === undefined || change === null) return '0.00';
    const prefix = change > 0 ? '+' : '';
    return `${prefix}${change.toFixed(2)}`;
  };

  const isDragActive = draggedIndex !== null && draggedIndex !== undefined;
  const isDraggingThis = onDragStart && draggedIndex === index;

  return (
    <div
      className={`stock-card trend-${trend} ${isDraggingThis ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${isDragActive && !isDraggingThis ? 'drag-candidate' : ''}`}
      draggable={!!onDragStart}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragEnd={onDragEnd}
      onDrop={handleDrop}
      onClick={() => onClick(stock)}
    >
      <div className="card-top">
        <div
          className="card-info"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '0.6rem',
            width: '80%',
          }}
        >
          {onDragStart && (
            <div
              className="drag-handle"
              style={{
                cursor: 'grab',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <GripVertical size={16} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <div className="card-symbol-row">
              <span className="card-symbol">{stock.symbol}</span>
            </div>
            <span
              className="card-name"
              title={stock.name}
              style={{
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {stock.name}
            </span>
          </div>
        </div>
        <button
          className="btn-remove"
          onClick={(e) => {
            e.stopPropagation(); // 詳細モーダルのオープンを防ぐ
            onRemove(stock.symbol);
          }}
          title="ウォッチリストから削除"
          style={{ flexShrink: 0 }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="card-price-row">
        <div className="card-price-container">
          <span className="card-price">
            {formatPrice(stock.price)}
            <span className="card-currency">{stock.currency}</span>
          </span>
        </div>

        <div className={`card-trend ${trend}`}>
          {trend === 'up' && <TrendingUp size={14} />}
          {trend === 'down' && <TrendingDown size={14} />}
          <span>{formatChange(stock.changePercent)}%</span>
        </div>
      </div>

      {stock.sparkline && stock.sparkline.length > 0 && (
        <div className="card-chart-container">
          <Sparkline data={stock.sparkline} trend={trend} />
        </div>
      )}
    </div>
  );
};

export default StockCard;
