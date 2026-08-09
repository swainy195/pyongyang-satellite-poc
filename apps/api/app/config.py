from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    app_env: str = "local"
    api_base_url: str = "http://localhost:8000"
    web_base_url: str = "http://localhost:5173"
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    gee_project_id: str = ""
    gee_service_account: str = ""
    google_application_credentials: str = ""
    report_llm_provider: str = ""
    report_llm_model: str = ""
    report_llm_api_key: str = ""
    report_prompt_version: str = "report-v1"
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
