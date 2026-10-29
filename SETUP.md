# My Timetable: setup guide

One website that shows your **EPITA** (Zeus) and **EM Normandie** (MyEMN) classes together.

- **EPITA** updates on its own: the site reads your private Zeus calendar link at most every 15 minutes.
- **EM Normandie** updates when you open your MyEMN timetable with the browser add-on installed. Every week you look at gets copied over. MyEMN has no export link, so this is the only way to get the data, and the add-on never sees your password.
- The phone feed puts both schools into Apple Calendar, Google Calendar or Outlook.

Setup takes about 15 minutes. You need free accounts on **GitHub** and **Vercel** (sign up to Vercel with GitHub).

---

## 1. Put the code on GitHub

1. Go to <https://github.com/new>, name it `my-timetable`, choose **Private**, and click **Create repository**.
2. On the next page, click **uploading an existing file**.
3. Unzip `my-timetable.zip`. Drag **everything inside the `calendar` folder** into the page (`api`, `lib`, `public`, `extension`, `package.json` and the rest), then click **Commit changes**.

## 2. Create the site on Vercel

1. Go to <https://vercel.com/new> and **Import** the `my-timetable` repository.
2. Before you click Deploy, open **Environment Variables** and add these two:

   | Name | Value |
   |---|---|
   | `APP_PASSWORD` | The class password. Share it with your classmates so they can open the site. |
   | `ADMIN_PASSWORD` | A different password, only for you. It unlocks the add-on sync key and hiding classes for everyone. |
   | `ZEUS_ICS_URL` | Your private Zeus link (see step 3). You can add it later. |

3. Click **Deploy**. You get an address like `https://my-timetable-xxxx.vercel.app`.

## 3. Get your Zeus link (EPITA)

1. Log in to Zeus (<https://zeus.ionis-it.com>) and open your timetable.
2. Look for the **calendar export / ICS / subscribe** option and copy the link. It looks like
   `https://zeus.ionis-it.com/api/group/12345/ics/abcdef…`
3. In Vercel, open **Settings → Environment Variables**, set `ZEUS_ICS_URL` to that link, then go to **Deployments → ⋯ → Redeploy**.

Keep this link private. Anyone who has it can see your timetable.

## 4. Add the database (it saves EM Normandie classes and your hidden classes)

1. In your Vercel project, open the **Storage** tab, click **Create Database**, and pick **Upstash for Redis**. The free plan is enough.
2. Connect it to the `my-timetable` project. Vercel adds the connection settings for you.
3. **Redeploy** once more (Deployments → ⋯ → Redeploy).

Open your site and log in with your `APP_PASSWORD`. Your EPITA classes should appear, and **Me → Updates** shows when each school was last updated.

## 5. Install the browser add-on (EM Normandie)

Works in Chrome, Edge, Brave and Arc.

1. Go to `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the **`extension`** folder from the unzipped files.
4. Click the add-on's icon (pin it from the puzzle-piece menu first) and fill in:
   - **Site address** and **Sync key**: on your site, go to **Me → Admin**, enter your `ADMIN_PASSWORD`, and copy both.
   - **MyEMN address**: fill this in only if your MyEMN timetable is *not* on an `em-normandie.com` or `em-normandie.fr` address. Type just the domain, e.g. `myemn.example.com`.
5. Click **Save**. It should say *Saved and connected*.
6. Open your **MyEMN timetable** and click through the next few weeks. A green ✓ on the add-on icon means the classes were sent.

Do this once a week, or whenever the school announces changes. The site shows when EM Normandie was last updated and turns the label red after 7 days.

## 6. Share it with your classmates

Send them the site address and the class password (`APP_PASSWORD`). The first time they open it, they pick their **French group (1–12)**, and the French classes of the other 11 groups disappear. They can change it any time under **Me**.

Each student's choices are their own:
- **Tap a class** → *Hide this class for me* or *Hide every "…" for me*. An **Undo** button appears right away, and **Me → Hidden by you** lists everything to bring back.
- Hiding for **everyone** is only possible for the admin (you, after entering `ADMIN_PASSWORD` under **Me → Admin**).
- On iPhone: Share → **Add to Home Screen** opens it like an app.

## 7. Add it to your phone's calendar

Under **Me → Phone calendar**, tap **Add to iPhone / Mac Calendar** or **Add to Google Calendar**. The link is personal: it follows your French group and your hidden classes, so you never need to add it again after changing them. Class names start with `[EPITA]` or `[EMN]`. Google refreshes subscribed calendars only every few hours.

---

## If something isn't working

| Problem | What to do |
|---|---|
| Login says *APP_PASSWORD is not set* | Add it in Vercel → Settings → Environment Variables, then redeploy. |
| "EPITA: not syncing" | The Zeus link is wrong or has expired. Copy it again (step 3). |
| *No database connected* | Do step 4. If the database is already connected, **redeploy**: the site only sees the database after a new deployment. |
| No **Admin** section / sync key | Add `ADMIN_PASSWORD` in Vercel and redeploy, then unlock it under **Me → Admin**. |
| A French class isn't hidden | The class name must contain *Français*, *French* or *FLE* plus a group number such as `GR3`, `Groupe 3` or `G3`. Send an example of a class name that isn't caught. |
| Add-on says *rejected that sync key* | Copy the sync key again from the site's Settings. It changes if you change `APP_PASSWORD`. |
| Add-on never shows ✓ on MyEMN | Check the MyEMN address field (step 5.4). If it still fails, open `https://<your-site>/api/status?raw=1` while logged in, or send a copy of MyEMN's `schedule?startDate=…` response from DevTools → Network, so the reader can be adjusted to MyEMN's exact format. |
| EM Normandie classes at the wrong time | Send a sample as above. Times without a time zone are read as Paris time. |

## For developers

```bash
npm install
npm test                                    # 9 automated checks
APP_PASSWORD=test ZEUS_ICS_URL=… npm run dev # http://localhost:3000, saves to .local-store.json
```

- `api/`: Vercel serverless functions (`events`, `emn`, `rules`, `feed`, `status`)
- `lib/`: Zeus ICS reader, MyEMN reader, hide rules, ICS feed builder, Paris time handling, storage
- `public/`: the website (FullCalendar)
- `extension/`: the add-on. `inject.js` watches the MyEMN page's own timetable requests, and `background.js` sends them to `/api/emn`.

The feed and sync keys are derived from `APP_PASSWORD`, so sharing the phone link never reveals the password.
