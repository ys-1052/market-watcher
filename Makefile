# ==========================================================================
# Market Watcher - Developer Task Runner Makefile
# ==========================================================================

.PHONY: help setup setup-backend setup-frontend dev dev-backend dev-frontend lint lint-backend lint-frontend format format-backend format-frontend clean docker-db

# デフォルトターゲット（ヘルプ表示）
help:
	@echo "=========================================================================="
	@echo "📈 Market Watcher 開発用コマンド一覧 (Makefile)"
	@echo "=========================================================================="
	@echo "  make setup            : バックエンドとフロントエンドの全依存関係をセットアップ"
	@echo "  make dev              : バックエンドとフロントエンドを1ターミナルで同時起動（Ctrl+Cで一括停止）"
	@echo "  make dev-backend      : バックエンド (FastAPI) のみを起動"
	@echo "  make dev-frontend     : フロントエンド (Vite React) のみを起動"
	@echo "  make docker-db        : Dockerで DynamoDB Local コンテナをバックグラウンド起動"
	@echo "  make lint             : バックエンドとフロントエンドの構文チェック (Lint) を実行"
	@echo "  make format           : バックエンドとフロントエンドの自動コード整形を実行"
	@echo "  make clean            : ビルドキャッシュ、Nodeモジュール、仮想環境、SQLite DBを削除"
	@echo "=========================================================================="

# 1. 環境構築 (Setup)
setup: setup-backend setup-frontend
	@echo "✅ すべてのセットアップが完了しました！ 'make dev' で同時起動できます。"

setup-backend:
	@echo "📦 バックエンド (FastAPI) のセットアップ中..."
	python3 -m venv venv
	./venv/bin/pip install -r backend/requirements.txt
	@echo "✅ バックエンドのセットアップ完了！"

setup-frontend:
	@echo "📦 フロントエンド (Vite React) のセットアップ中..."
	npm install --prefix frontend
	@echo "✅ フロントエンドのセットアップ完了！"

# 2. 開発起動 (Run Servers)
docker-db:
	@echo "🐳 DynamoDB Local コンテナを起動中..."
	docker compose up -d
	@echo "✅ DynamoDB Local 起動完了！ (ポート 8000)"

dev:
	@echo "🚀 バックエンドとフロントエンドを同時起動します..."
	@echo "💡 終了するには Ctrl + C を押してください。"
	@(trap 'kill 0' SIGINT; make dev-backend & make dev-frontend)

dev-backend:
	@echo "🐍 バックエンドサーバーを起動中 (ポート 8080)..."
	@AWS_ENV=local ./venv/bin/uvicorn backend.main:app --port 8080 --reload

dev-frontend:
	@echo "⚡ フロントエンド開発サーバーを起動中 (ポート 5173)..."
	@npm run dev --prefix frontend

# 3. 構文チェック (Lint)
lint: lint-backend lint-frontend
	@echo "✅ すべての構文チェックがパスしました！"

lint-backend:
	@echo "🔍 Python (flake8) 構文チェックを実行中..."
	./venv/bin/flake8 backend/

lint-frontend:
	@echo "🔍 JavaScript (eslint) 構文チェックを実行中..."
	npm run lint --prefix frontend

# 4. コード自動整形 (Formatter)
format: format-backend format-frontend
	@echo "✅ すべてのコード整形が完了しました！"

format-backend:
	@echo "🧼 Python (black) コード自動整形を実行中..."
	./venv/bin/black backend/

format-frontend:
	@echo "🧼 JavaScript (prettier) コード自動整形を実行中..."
	npm run format --prefix frontend

# 5. クリーンアップ (Clean)
clean:
	@echo "🧹 キャッシュやビルドファイルのクリーンアップ中..."
	rm -rf venv
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	rm -f backend/watchlist.db
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	@echo "✨ クリーンアップ完了！"
