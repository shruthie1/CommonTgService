# Schema Redesign Tracker

**Goal:** Anti-detection — avoid Telegram catching automation and account farming.
**Approach:** Incremental changes, design first, implement when locked.

---

## clients (collection: `clients`)

**Status:** LOCKED — ready to implement

### Remove
- `name` — replaced by firstNames/lastNames pools
- `mainAccount` — not needed
- `dedicatedIps` — not needed

### Add
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `firstNames` | string[] | [] | Pool of first name variations for persona |
| `lastNames` | string[] | [] | Pool of last name variations for persona |
| `bios` | string[] | [] | Pool of bio variations for persona |
| `profilePics` | string[] | [] | Pool of profile picture URLs |

### Sample Object
```json
{
  "channelLink": "paid_giirl_shruthiee",
  "dbcoll": "shruthi",
  "link": "PaidGirl.netlify.app/Shruthi1",
  "mobile": "916265240911",
  "password": "Ajtdmwajt1@",
  "repl": "https://shruthi1.glitch.me",
  "promoteRepl": "https://shruthiprom0101.glitch.me",
  "session": "1BQANOTEuM==",
  "username": "ShruthiRedd2",
  "clientId": "shruthi1",
  "deployKey": "https://shruthi1.glitch.me/exit",
  "product": "booklet_10",
  "qrId": "paytmqr281005050101xv6mfg02t4m9@paytm",
  "gpayId": "myred1808@postbank",
  "firstNames": ["Shruthi", "Shruti", "Shru", "Shruthii", "Shruti"],
  "lastNames": ["Reddy", "R", "", "Reddi", "reddyy"],
  "bios": ["✨ link in bio", "DM for exclusive 💋", "👇 check pinned"],
  "profilePics": [
    "https://res.cloudinary.com/xxx/shruthi_1.jpg",
    "https://res.cloudinary.com/xxx/shruthi_2.jpg",
    "https://res.cloudinary.com/xxx/shruthi_3.jpg"
  ],
  "createdAt": "2026-03-15T10:00:00Z",
  "updatedAt": "2026-04-01T12:00:00Z"
}
```

---

## promoteClients (collection: `promoteClients`)

**Status:** PENDING DESIGN

---

## bufferClients (collection: `bufferClients`)

**Status:** NOT STARTED
