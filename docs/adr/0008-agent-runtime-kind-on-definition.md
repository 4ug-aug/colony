# Agent runtime kind on the definition

Status: accepted

Each agent definition is one person: instructions, requested capabilities, an
explicit container image, and an **agent runtime kind** (`cursor` or
`openai-agents`). Composition injects workspace credentials for that kind; the
definition never stores API keys. Do not create a second person that differs
only by engine (rejected: `software-engineer-cursor`). Do not let the workspace
UI pick a runtime per run (rejected: runtime shopping). A coordinator
id→runtime map was rejected because it hides the person's engine as roster
folklore; the kind belongs on the definition snapshot so new people stay
explicit and maintainable.
