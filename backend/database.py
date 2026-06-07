import os
import json
import sqlite3
import boto3
from botocore.exceptions import ClientError, EndpointConnectionError
from botocore.config import Config

# 環境変数の取得
AWS_ENV = os.getenv("AWS_ENV", "local")
TABLE_NAME = os.getenv("TABLE_NAME", "market-watcher-dashboards")
SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "watchlist.db")

# SQLiteフォールバックのフラグ
USE_SQLITE = False


def get_dynamodb_resource():
    """
    DynamoDBのリソースを取得する。
    AWS_ENVが'local'の場合は、Docker Composeで起動しているDynamoDB Local(http://localhost:8000)に接続します。
    """
    if AWS_ENV == "local":
        # 接続ポートがデッド状態の場合の起動遅延を防ぐため、タイムアウトを1秒に制限
        fast_config = Config(connect_timeout=1.0, read_timeout=1.0, retries={"max_attempts": 0})
        return boto3.resource(
            "dynamodb",
            endpoint_url="http://localhost:8000",
            region_name="us-east-1",
            aws_access_key_id="local",
            aws_secret_access_key="local",
            config=fast_config,
        )
    else:
        return boto3.resource("dynamodb")


# --- SQLite フォールバック用ユーティリティ ---


def init_sqlite():
    """SQLiteのデータベースとテーブルを初期化する"""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dashboards (
            UserId TEXT,
            DashboardId TEXT,
            Name TEXT,
            Tickers TEXT,
            PRIMARY KEY (UserId, DashboardId)
        )
    """)
    conn.commit()
    conn.close()
    print(f"Fallback SQLite database initialized at {SQLITE_DB_PATH}")


def get_sqlite_dashboards(user_id: str):
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM dashboards WHERE UserId = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()

    items = []
    for row in rows:
        items.append(
            {
                "UserId": row["UserId"],
                "DashboardId": row["DashboardId"],
                "Name": row["Name"],
                "Tickers": json.loads(row["Tickers"]),
            }
        )
    return items


def get_sqlite_dashboard(user_id: str, dashboard_id: str):
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM dashboards WHERE UserId = ? AND DashboardId = ?", (user_id, dashboard_id))
    row = cursor.fetchone()
    conn.close()

    if row:
        return {
            "UserId": row["UserId"],
            "DashboardId": row["DashboardId"],
            "Name": row["Name"],
            "Tickers": json.loads(row["Tickers"]),
        }
    return None


def save_sqlite_dashboard(user_id: str, dashboard_id: str, name: str, tickers: list):
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()
    tickers_str = json.dumps(tickers)
    cursor.execute(
        """
        INSERT OR REPLACE INTO dashboards (UserId, DashboardId, Name, Tickers)
        VALUES (?, ?, ?, ?)
    """,
        (user_id, dashboard_id, name, tickers_str),
    )
    conn.commit()
    conn.close()
    return {"UserId": user_id, "DashboardId": dashboard_id, "Name": name, "Tickers": tickers}


def delete_sqlite_dashboard(user_id: str, dashboard_id: str):
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dashboards WHERE UserId = ? AND DashboardId = ?", (user_id, dashboard_id))
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0


# --- エントリーポイントと初期化 ---


def init_db():
    """
    テーブル初期化。
    DynamoDB Localへの接続を試み、接続できない場合はSQLiteに自動フォールバックします。
    """
    global USE_SQLITE

    if AWS_ENV != "local":
        # 本番AWS環境ではDynamoDBを強制使用
        try:
            db = get_dynamodb_resource()
            table = db.Table(TABLE_NAME)
            table.load()
            print(f"DynamoDB Table '{TABLE_NAME}' loaded successfully.")
            return
        except Exception as e:
            print(f"Failed to check DynamoDB Table '{TABLE_NAME}' in AWS environment: {e}")
            raise e

    # ローカル環境の初期化
    db = get_dynamodb_resource()
    try:
        table = db.Table(TABLE_NAME)
        table.load()
        print(f"DynamoDB Local Table '{TABLE_NAME}' already exists.")
    except EndpointConnectionError:
        print("⚠️ DynamoDB Local is not reachable. Falling back to SQLite for local development.")
        USE_SQLITE = True
        init_sqlite()
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            print(f"Table '{TABLE_NAME}' not found in DynamoDB Local. Creating...")
            try:
                db.create_table(
                    TableName=TABLE_NAME,
                    KeySchema=[
                        {"AttributeName": "UserId", "KeyType": "HASH"},
                        {"AttributeName": "DashboardId", "KeyType": "RANGE"},
                    ],
                    AttributeDefinitions=[
                        {"AttributeName": "UserId", "AttributeType": "S"},
                        {"AttributeName": "DashboardId", "AttributeType": "S"},
                    ],
                    ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
                )
                print(f"Table '{TABLE_NAME}' created in DynamoDB Local.")
            except Exception as create_err:
                print(f"Error creating DynamoDB Local Table: {create_err}. Falling back to SQLite.")
                USE_SQLITE = True
                init_sqlite()
        else:
            print(f"ClientError: {e}. Falling back to SQLite.")
            USE_SQLITE = True
            init_sqlite()
    except Exception as e:
        print(f"Unexpected error: {e}. Falling back to SQLite.")
        USE_SQLITE = True
        init_sqlite()


# --- CRUD ラッパー ---


def get_dashboards(user_id: str):
    if USE_SQLITE:
        return get_sqlite_dashboards(user_id)

    db = get_dynamodb_resource()
    table = db.Table(TABLE_NAME)
    try:
        response = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key("UserId").eq(user_id))
        return response.get("Items", [])
    except Exception as e:
        print(f"DynamoDB query failed: {e}. Using SQLite fallback.")
        return get_sqlite_dashboards(user_id)


def get_dashboard(user_id: str, dashboard_id: str):
    if USE_SQLITE:
        return get_sqlite_dashboard(user_id, dashboard_id)

    db = get_dynamodb_resource()
    table = db.Table(TABLE_NAME)
    try:
        response = table.get_item(Key={"UserId": user_id, "DashboardId": dashboard_id})
        return response.get("Item")
    except Exception as e:
        print(f"DynamoDB get failed: {e}. Using SQLite fallback.")
        return get_sqlite_dashboard(user_id, dashboard_id)


def save_dashboard(user_id: str, dashboard_id: str, name: str, tickers: list):
    if USE_SQLITE:
        return save_sqlite_dashboard(user_id, dashboard_id, name, tickers)

    db = get_dynamodb_resource()
    table = db.Table(TABLE_NAME)
    try:
        item = {"UserId": user_id, "DashboardId": dashboard_id, "Name": name, "Tickers": tickers}
        table.put_item(Item=item)
        return item
    except Exception as e:
        print(f"DynamoDB put failed: {e}. Using SQLite fallback.")
        return save_sqlite_dashboard(user_id, dashboard_id, name, tickers)


def delete_dashboard(user_id: str, dashboard_id: str):
    if USE_SQLITE:
        return delete_sqlite_dashboard(user_id, dashboard_id)

    db = get_dynamodb_resource()
    table = db.Table(TABLE_NAME)
    try:
        table.delete_item(Key={"UserId": user_id, "DashboardId": dashboard_id})
        return True
    except Exception as e:
        print(f"DynamoDB delete failed: {e}. Using SQLite fallback.")
        return delete_sqlite_dashboard(user_id, dashboard_id)
