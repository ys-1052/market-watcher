import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

const SearchBar = ({ onAddTicker }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef(null);

  // デバウンス用のタイマー設定
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 300); // 300msデバウンス

    return () => clearTimeout(timer);
  }, [query]);

  // ドロップダウンの外側をクリックしたときに閉じる
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
        setIsOpen(true);
        setSelectedIndex(-1); // インデックスをリセット
      }
    } catch (e) {
      console.error('Error searching tickers:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (symbol) => {
    onAddTicker(symbol);
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isOpen && selectedIndex >= 0 && selectedIndex < suggestions.length) {
      // キーボードで選択されている候補を追加
      handleSelect(suggestions[selectedIndex].symbol);
    } else {
      // 入力値で直接追加
      if (!query.trim()) return;
      let targetSymbol = query.trim().toUpperCase();
      if (/^\d{4}$/.test(targetSymbol)) {
        targetSymbol = `${targetSymbol}.T`;
      }
      handleSelect(targetSymbol);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="search-wrapper" ref={dropdownRef}>
      <form onSubmit={handleSubmit}>
        <div className="search-input-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="銘柄名またはティッカー"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
          {isLoading && (
            <Loader2
              size={18}
              className="absolute right-3 text-muted animate-spin"
              style={{ position: 'absolute', right: '12px' }}
            />
          )}
        </div>
      </form>

      {isOpen && (
        <div className="search-suggestions">
          {suggestions.length > 0 ? (
            suggestions.map((item, index) => (
              <div
                key={item.symbol}
                className={`suggestion-item ${index === selectedIndex ? 'highlighted' : ''}`}
                onClick={() => handleSelect(item.symbol)}
                style={{
                  backgroundColor: index === selectedIndex ? 'rgba(255, 255, 255, 0.1)' : '',
                  borderLeft:
                    index === selectedIndex
                      ? '3px solid var(--accent-blue)'
                      : '3px solid transparent',
                  paddingLeft: index === selectedIndex ? '13px' : '16px', // border分の調整
                }}
              >
                <div className="suggestion-top">
                  <span className="suggestion-symbol">{item.symbol}</span>
                  <span className="suggestion-exchange">{item.exchange}</span>
                </div>
                <div className="suggestion-name">{item.name}</div>
              </div>
            ))
          ) : (
            <div className="search-empty">
              「{query}」に一致する銘柄が見つかりません。
              <div
                className="suggestion-item"
                style={{
                  marginTop: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                }}
                onClick={() => handleSelect(query.trim().toUpperCase())}
              >
                <strong>「{query.trim().toUpperCase()}」を追加</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
