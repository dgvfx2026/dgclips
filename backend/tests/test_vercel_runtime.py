from src.vercel_runtime import missing_configuration


def test_demo_never_activates_the_real_worker(monkeypatch):
    for key in ("BACKEND_DATABASE_URL", "REDIS_HOST", "REDIS_PASSWORD", "BACKEND_AUTH_SECRET", "APP_SETTINGS_ENCRYPTION_KEY", "MEDIA_S3_BUCKET"):
        monkeypatch.setenv(key, "example-configured-value")
    monkeypatch.setenv("MEDIA_STORAGE", "s3")
    monkeypatch.setenv("DGCLIPS_DEMO", "true")
    assert "DGCLIPS_DEMO=false" in missing_configuration()
    monkeypatch.setenv("DGCLIPS_DEMO", "false")
    assert missing_configuration() == []


def test_missing_storage_prevents_cross_instance_file_loss(monkeypatch):
    monkeypatch.setenv("DGCLIPS_DEMO", "false")
    monkeypatch.setenv("MEDIA_STORAGE", "local")
    assert "MEDIA_STORAGE=s3" in missing_configuration()
