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

## Host it free with GitHub Pages and Supabase

GitHub Pages hosts the files in `public/`. Supabase stores the shared picker data.

### 1. Create the Supabase database

1. Create a free project at Supabase.
2. Open the Supabase project dashboard.
3. Go to **SQL Editor**.
4. Paste everything from `supabase.sql`.
5. Run it.

This creates one protected table and two public functions:

- `random_picker_load`
- `random_picker_save`

The table has row level security enabled and no direct anonymous table access. The webpage can only load/save through those functions using your shared picker code.

### 2. Add your Supabase URL and publishable key

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

### 3. Enable GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`, which publishes the `public/` folder.

In GitHub:

1. Push the repo to GitHub.
2. Go to **Settings** > **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to the `main` branch.
5. Open the Pages URL after the workflow finishes.

### 4. Use the same shared code on each device

When the app opens, it asks for a shared picker code. Use the same code on every device, for example:

```text
family-picker
```

Anyone with the URL, Supabase project details, and that shared code can edit that picker.
