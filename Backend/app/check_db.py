import psycopg

from app.database import get_connection


def main():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT
                        current_database() AS database_name,
                        current_user AS database_user;
                """)
                info = cursor.fetchone()

                print("Kết nối PostgreSQL thành công!")
                print("Database:", info["database_name"])
                print("User:", info["database_user"])

                cursor.execute("""
                    SELECT id, name
                    FROM public.subjects
                    ORDER BY id;
                """)
                subjects = cursor.fetchall()

                print("Số môn học:", len(subjects))

                for subject in subjects:
                    print(f'{subject["id"]}: {subject["name"]}')

    except psycopg.Error as error:
        print("Không kết nối hoặc truy vấn được PostgreSQL.")
        print("Loại lỗi:", type(error).__name__)
        print("SQLSTATE:", error.sqlstate or "Không có")
        raise SystemExit(1)

    except (RuntimeError, ValueError) as error:
        print("Cấu hình không hợp lệ:", error)
        raise SystemExit(1)


if __name__ == "__main__":
    main()