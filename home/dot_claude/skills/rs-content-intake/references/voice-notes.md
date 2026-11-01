# Voice notes

Ideas come from OpenWhispr, the global dictation app. Its CLI reads the local transcriptions while
the desktop app is running: `openwhispr --local transcriptions list --limit 200 --format json`.
Fields used: `created_at`, `text`, `deleted_at`.

To capture an idea, start the dictation with "ideia:" and say it in one go, for example
"ideia: mostrar quanto custou em tokens fazer o site". The collector marks those notes
`ideia:` in the title. Other transcriptions are mostly instructions to agents; they come in as
`nota:` and are usually `descartar`, unless one holds an idea.

Every voice item is `review` unless an allow word matches: voice notes are personal.

Not checked yet: whether the CLI works with the desktop app closed. If it fails, the collector
skips voice and the report says so.
