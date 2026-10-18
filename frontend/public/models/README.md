# Local model files only

Model weights are intentionally absent from this repository.

Configure `config/models.local.json` using `config/models.example.json`, then run
`npm run setup:vision` to download the selected public, pinned models locally.
Everything in this directory except this README is ignored and blocked by the
publication check. Do not store credentials or upload user images here.
