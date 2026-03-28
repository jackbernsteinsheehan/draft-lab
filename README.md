# Draft Lab
Draft lab is a fantasy football pre-draft research tool. It stores data on all mock drafts and allows users to filter their past mock drafts by different draft strategies and analyze the results.

## Development plan
- Create mock draft engine
- store mock draft results
- define draft strategies
- build features for sorting by draft strategy
- simulate or pull projects point totals from some API (nflreadpy, fantasypros etc)
- Create UI/UX


## setup
```powershell
pip3 install nflreadpy
pip3 install pandas
```


## Stack
- Data will be periodically pulled from nflreadpy and loaded into SQL db
https://nflreadpy.nflverse.com/

- At the start of every mock draft, current data will fetched from the SQL db and usd to populate the draft
- Draft history for each user will be stored in SQL
- Drafts will be classified by different draft strategies (2 RB, 2 WR, early QB, early TE)
    - There is an open source project that does this classification: https://github.com/faverogian/nfl-fantasim
