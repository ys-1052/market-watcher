import React, { useEffect, useRef } from 'react';

const Sparkline = ({ data, trend }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    // レスポンシブ対応のための画素比率の調整
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // 描画データの準備
    const prices = data.map((item) => item.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min === 0 ? 1 : max - min;

    // XとYの比率を計算（上下に余白を設ける）
    const padding = 4;
    const points = data.map((item, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - padding - ((item.price - min) / range) * (height - 2 * padding);
      return { x, y };
    });

    // 線の色を設定
    let strokeStyle = '#9ca3af'; // ニュートラル
    let gradientStart = 'rgba(156, 163, 175, 0.15)';

    if (trend === 'up') {
      strokeStyle = '#10b981'; // ネオングリーン
      gradientStart = 'rgba(16, 185, 129, 0.2)';
    } else if (trend === 'down') {
      strokeStyle = '#f43f5e'; // ネオンレッド
      gradientStart = 'rgba(244, 63, 94, 0.2)';
    }

    // キャンバスの初期化
    ctx.clearRect(0, 0, width, height);

    // 1. グラデーションの塗りつぶし（下部エリア）
    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, gradientStart);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // 2. 滑らかな折れ線の描画
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // ベジェ曲線を用いて線をつなぐ（角を丸くする）
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [data, trend]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

export default Sparkline;
