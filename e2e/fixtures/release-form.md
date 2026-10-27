Three ways to mark the card whose panel is open. Pick one and I build it.

```a2ui
[
  {"version":"v0.9","createSurface":{"surfaceId":"open-card","catalogId":"basic"}},
  {"version":"v0.9","updateComponents":{"surfaceId":"open-card","components":[
    {"id":"root","component":"Card","child":"col"},
    {"id":"col","component":"Column","children":["t","look","go"]},
    {"id":"t","component":"Text","variant":"h3","text":"Which mark for the open card?"},
    {"id":"look","component":"ChoicePicker","label":"Look","variant":"mutuallyExclusive","options":[{"label":"A · Gold ring","value":"a"},{"label":"B · Gold title","value":"b"},{"label":"C · Edge bar","value":"c"}],"value":{"path":"/look"}},
    {"id":"go","component":"Button","variant":"primary","child":"gol","action":{"event":{"name":"chosen","context":{"look":{"path":"/look"}}}}},
    {"id":"gol","component":"Text","text":"Build it"}
  ]}},
  {"version":"v0.9","updateDataModel":{"surfaceId":"open-card","path":"/","value":{"look":["a"]}}}
]
```
