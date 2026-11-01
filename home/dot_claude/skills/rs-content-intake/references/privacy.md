# Privacy: the block and allow lists

Two plain-text lists, kept outside any repo so their words stay private:

| File | Effect |
|---|---|
| `~/.config/rs-content-intake/block.txt` | An item whose title, detail or link contains a listed word is dropped by `collect.sh`. It is only counted, never written anywhere. `send.sh --check` refuses a draft that contains one. |
| `~/.config/rs-content-intake/allow.txt` | An item that matches gets `class: allow`: its detail may go into the draft and the Wiki. |

Everything else gets `class: review`: the title goes into the draft, marked "revisar", with no
detail. A person keeps or drops it before sending.

Format: one word or phrase per line, case-insensitive, `#` for comments. Both files are created
empty on the first run. Put in `block.txt`: client and company names under NDA, people who did not
agree to appear, secret names, internal hostnames. Put in `allow.txt`: public projects and public
repos.

With both lists empty, every item is `review`. That is safe for a local draft, and the reason
sending needs a person.
