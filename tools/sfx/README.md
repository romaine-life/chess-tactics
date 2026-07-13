# SFX authoring

SFX source recordings, slices, candidate variants, and accepted bytes are
live-storage-backed. The former repository slicing script was deleted because it
published directly into `frontend/public`.

Slice a private source recording only in a temporary workspace, upload each
one-shot as a typed SFX candidate with timing/provenance metadata, review it in
the real audio surface, and accept it through the backend transaction. Do not
copy source or output audio into Git.
