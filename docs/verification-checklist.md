# Verification Checklist

## External Rename Recovery

1. Add a tag, note, and favorite to one STL or 3MF file.
2. Wait for library data to finish saving.
3. Rename the file in Windows Explorer.
4. Confirm the renamed card keeps its tag, note, and favorite.
5. Rename its parent folder in Windows Explorer.
6. Confirm the model keeps the same data at the new folder path.
7. Disable folder monitoring, rename another identified model in Explorer, and click Refresh.
8. Confirm the manual refresh reconnects its data.

## Ambiguity Safety

1. Create two byte-identical copies of an identified model.
2. Remove or rename the original outside the app while both copies are new candidates.
3. Confirm the app does not attach the saved data to either copy automatically.
4. Open Settings > Data & maintenance.
5. Confirm the protected relocation is reported and the old metadata remains available for recovery.

## Library Switching

1. Open library A and confirm its tags.
2. Switch to library B and confirm A's tags are absent.
3. Close and reopen the app.
4. Confirm library B remains active.
5. Copy thumbnail diagnostics and confirm the report names library B's root and ID.

## Regression Checks

1. Rename and move a model inside the app, then undo the move.
2. Confirm tags, notes, favorite state, and slicer history follow both operations.
3. Drag an STL into Cura and Creality Print.
4. Confirm external drag still imports a real model file.
5. Run `npm test` and `npm run build`.
