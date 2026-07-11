# Wedding RSVP app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and replace the Firebase/admin placeholders with your own values.
3. Run the app:
   `npm run dev`

## Sensitive local data

Do not commit real `.env.local`, Firebase service-account JSON, `baseList.json`, or private deployment URLs.

## Admin access (Firebase Authentication)

Admin login uses real Firebase Authentication (Email/Password), enforced independently by Firestore security rules - not a password baked into the app's public code.

Setup (one time, in the Firebase Console for your project):
1. Authentication → Sign-in method → enable **Email/Password**.
2. Authentication → Users → **Add user** → your email + a password of your choice. Copy the UID shown next to the new user.
3. Open `firestore.rules`, find the `isAdmin()` function near the top, and replace `'REPLACE_WITH_YOUR_ADMIN_UID'` with the UID from step 2 (add more comma-separated UIDs for additional admins).
4. Firestore Database → Rules → paste in the updated `firestore.rules` content → **Publish**.

After that, sign in on `/he/admin` (or `/en/admin`, `/fr/admin`) with that email and password.

**Important - re-publish rules for this update:** this version changes what the `guestRoster` collection's rules allow (admins can now add/edit/delete roster entries from the dashboard itself, not just read them). Publish the updated `firestore.rules` again (Firebase Console, or the CLI below), even if you already did this before.

### Faster rules deploys with the Firebase CLI (optional, one-time setup)

Instead of copy-pasting into the Firebase Console every time `firestore.rules` changes, you can deploy it with one command from your terminal. This project already has `firebase.json` and `.firebaserc` pointing at your `shelly-gil-wedding` project, so once you've done this setup, publishing a new rules file is always just:

`firebase deploy --only firestore:rules`

One-time setup:
1. Install the CLI: `npm install -g firebase-tools`
2. Sign in (opens your browser, uses the same Google account that owns the Firebase project): `firebase login`
3. From the project folder, run the deploy command above.

You still run this yourself each time the rules change - I don't have access to your Firebase account or a live connection to your project, so I can't publish rules or run write-scripts on your behalf. This just turns "several console clicks" into one command.

## Sync the invite base list

Validate `baseList.json` without writing to Firebase:

`npm run sync:base-list`

Seed the `baseList` collection and backfill matching `inviteLinkVisits` rows:

`npm run sync:base-list -- --write`

The public invite flow reads `baseList/{normalizedPhone}` directly. If rows were
added in Firebase with auto-generated document IDs, run the sync command above
so each guest also has a phone-keyed document such as `baseList/<normalized-phone>`.

For `--write`, authenticate with a Firebase service account by setting either
`GOOGLE_APPLICATION_CREDENTIALS` to a local service-account JSON file path or
`FIREBASE_SERVICE_ACCOUNT_JSON` to the JSON content. Keep both values outside
committed files.

## Guest roster (dashboard "Guest Roster" section)

The Guest Roster section at the top of the admin dashboard shows every invited
guest (invited / confirmed / declined / pending, by side and by category), and
is now a full source of truth you can edit directly:

- **Sync from Sheet** button - pulls your master guest-list Google Sheet (must
  be shared as "Anyone with the link - Viewer") and adds any guest that isn't
  in the roster yet. It never touches or overwrites guests already in the
  roster, so any manual edits you've made are always safe.
- **Add guest** - add someone who isn't on the sheet at all (e.g. a late add).
- Inline editing - change a guest's status (confirmed / declined / pending) or
  guest count directly in the table, or delete a row, with no script needed.

### One-time migration if you used an earlier version of this app

Older versions of this app imported the roster with a different internal ID
scheme (MD5) than the one the dashboard's Sync button now uses (SHA-256, the
only hash available in the browser). If you already ran `sync:guest-roster`
before this update, run the import **one more time with `--replace-all`** so
existing rows switch to the new ID scheme and the Sync button and Node script
stay in agreement (otherwise Sync would treat everyone as new and create
duplicates). This wipes and re-imports the whole `guestRoster` collection from
the sheet, so do it once, before you rely on manual dashboard edits:

`npm run sync:guest-roster -- --write --replace-all`

If this is your **first time** importing the roster, just run the normal command:

`npm run sync:guest-roster -- --write`

After that one-time step, only run the plain (non `--replace-all`) command
again if you want to pull in new sheet rows via the terminal instead of the
dashboard's Sync button - it only adds guests that aren't already in the
roster and never overwrites or duplicates existing ones. Same credential setup
as `sync:base-list` above (`GOOGLE_APPLICATION_CREDENTIALS` or
`FIREBASE_SERVICE_ACCOUNT_JSON`).
