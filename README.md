# Random Picker

A small shared web app for creating saved lists, uploading list files, editing numbered items, picking a random item, and optionally deleting the picked item.

## Run it locally

```powershell
npm start
```

Open the app on this computer:

```text
http://localhost:3000
```

To use it from another device, keep this computer running and open the network address printed by the server, such as:

```text
http://192.168.1.154:3000
```

Both devices need to be on the same network. If Windows asks about firewall access for Node.js, allow private network access.

## Upload format

You can upload:

- `.txt` with one item per line
- `.csv` with exactly two columns: `number,title`
- `.json` as either an array of strings, an array of numbered items, or an object with an `items` array

CSV files can include a header row:

```csv
number,title
1,Pizza
2,Tacos
3-1,Sushi A
3-2,Sushi B
4,Pasta
```

Numbered JSON items look like this:

```json
{
  "number": "12",
  "title": "Pizza"
}
```

Numbers must be unique inside each list. If the "Hide item titles when picking" checkbox is enabled, the picker shows only the item's number.
Sub numbers are supported too, such as `1`, `2`, `3-1`, `3-2`, and `4`.

Saved lists are stored in `data/lists.json`.

## Scan new item

The hosted app has a **Scan new item** button. On phones, it opens the camera/photo picker, looks for ISBN/book matches, auto-fills the next available number, and lets you edit both the number and title before confirming. The app only offers database matches from free book APIs, not raw OCR text. If scanning cannot find a reliable match, use the ISBN/title search field.

## Host it free with GitHub Pages and Supabase

GitHub Pages hosts the files in `public/`. Supabase Auth handles sign-in, and Supabase stores each user's picker data.

### 1. Create the Supabase database

1. Create a free project at Supabase.
2. Open the Supabase project dashboard.
3. Go to **SQL Editor**.
4. Paste everything from `supabase.sql`.
5. Run it.

This creates one protected user-data table and two authenticated functions:

- `random_picker_load`
- `random_picker_save`

The table has row level security enabled and no direct anonymous table access. The webpage can only load/save through those functions after a user signs in.

### 2. Configure Supabase Auth

In Supabase, go to **Authentication** > **URL Configuration**.

Set:

```text
Site URL: https://evelyneweibel.github.io/RandomPicker/
```

Add this redirect URL:

```text
https://evelyneweibel.github.io/RandomPicker/
```

Then go to **Authentication** > **Providers** > **Email** and make sure Email sign-in is enabled.

### 3. Add your Supabase URL and publishable key

In Supabase, go to **Project Settings** > **API**.

Copy:

- Project URL
- Publishable key

Then edit `public/config.js`:

```js
window.RANDOM_PICKER_SUPABASE = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-PUBLISHABLE-KEY"
};
```

The publishable key is meant for browser apps. Do not use the secret key, service role key, or direct database connection string.

### 4. Enable GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`, which publishes the `public/` folder.

In GitHub:

1. Push the repo to GitHub.
2. Go to **Settings** > **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to the `main` or `master` branch.
5. Open the Pages URL after the workflow finishes.

### 5. Sign in

Open the Pages URL and enter your email address. Supabase sends a sign-in link. Open that link, and your picker data will save under your account.
