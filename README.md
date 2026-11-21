# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/51prass/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/51prass/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: it answers exactly as the reference does on every case — BOM, LF/CRLF, stray CRs, quoted fields, quote junk, unterminated quotes, short and long rows, error order — but reads with `indexOf`/`slice`/`split` instead of one character at a time. On the practice set it parses in ~0.11 s against the reference's ~1.2 s.

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=output node main.ts
```

`main.ts` reads every case from `cases.json` in the input directory, answers each with `run` from `solve.js`, and writes `answers.json` to the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=kq36bfy4&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
