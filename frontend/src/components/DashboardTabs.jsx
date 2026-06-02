import React, { useState } from 'react';
import { Plus, Trash2, FolderPlus, X } from 'lucide-react';

const DashboardTabs = ({ dashboards, activeId, onChangeTab, onCreateTab, onDeleteTab }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTabName, setNewTabName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newTabName.trim()) return;
    onCreateTab(newTabName.trim());
    setNewTabName('');
    setShowCreateModal(false);
  };

  return (
    <div className="dashboard-controls">
      <div className="tabs-wrapper">
        {dashboards.map((dash) => {
          const isActive = dash.DashboardId === activeId;
          return (
            <button
              key={dash.DashboardId}
              className={`tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => onChangeTab(dash.DashboardId)}
            >
              <span>{dash.Name}</span>
              {dashboards.length > 1 && (
                <span
                  className="delete-tab-btn"
                  onClick={(e) => {
                    e.stopPropagation(); // タブ切り替えを防ぐ
                    if (confirm(`ダッシュボード「${dash.Name}」を削除してもよろしいですか？`)) {
                      onDeleteTab(dash.DashboardId);
                    }
                  }}
                  title="ダッシュボードを削除"
                >
                  <X size={10} />
                </span>
              )}
            </button>
          );
        })}

        <button
          className="tab-btn"
          onClick={() => setShowCreateModal(true)}
          style={{
            border: '1px dashed rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.01)',
          }}
          title="新規ダッシュボード作成"
        >
          <FolderPlus size={16} />
          <span>ダッシュボード作成</span>
        </button>
      </div>

      {showCreateModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1100 }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="modal-wrapper"
            style={{ maxWidth: '400px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ padding: '1.25rem 1.5rem' }}>
              <span className="modal-symbol" style={{ fontSize: '1.4rem' }}>
                新規ダッシュボード
              </span>
              <button className="btn-close" onClick={() => setShowCreateModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="dialog-form">
              <div className="form-group">
                <label className="form-label">ダッシュボード名</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="例: テック株, 高配当株"
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  キャンセル
                </button>
                <button type="submit" className="btn-primary">
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardTabs;
