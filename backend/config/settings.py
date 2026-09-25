import os
from pathlib import Path
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent #Thư mục backend
PROJECT_DIR = BASE_DIR.parent #Thư mục ptn
load_dotenv(PROJECT_DIR / ".env")


def get_boolean_env(name, default=False):
    """Đọc biến môi trường kiểu True/False một cách rõ ràng."""
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def get_list_env(name, default=""):
    """Đọc danh sách giá trị phân tách bằng dấu phẩy từ biến môi trường."""
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "Thiếu DJANGO_SECRET_KEY. Hãy sao chép .env.example thành .env và điền khóa bảo mật."
    )

DEBUG = get_boolean_env("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = get_list_env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# Application definition

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.staticfiles',
    "corsheaders",
    "accounts",
    "layers",
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Cho phép frontend ở cổng 5173 gọi API Django.
    "corsheaders.middleware.CorsMiddleware",
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

WSGI_APPLICATION = 'config.wsgi.application'


# Giai đoạn 1 dùng SQLite để backend chạy độc lập. Khi có POSTGRES_HOST ở
# Giai đoạn 3, hệ thống tự chuyển sang PostgreSQL/PostGIS theo cấu hình .env.
if os.getenv("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB"),
            "USER": os.getenv("POSTGRES_USER"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD"),
            "HOST": os.getenv("POSTGRES_HOST"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = "vi"

TIME_ZONE = "Asia/Ho_Chi_Minh"

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = "/static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Cho phép request GeoTIFF tối đa 512 MB; file lớn vẫn được Django ghi tạm ra đĩa.
DATA_UPLOAD_MAX_MEMORY_SIZE = 512 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024


# Những địa chỉ frontend được phép gọi API khi lập trình trên máy cá nhân.
CORS_ALLOWED_ORIGINS = get_list_env(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
