# /ap — Advanced Prompt

Strip the trigger. Use the rest of the user's message as the topic: $ARGUMENTS

## Workflow

1. **Create the prompt** — Write an advanced, expert-level prompt to `workspace/prompts/` using kebab-case `.md` naming. The prompt must:
   - Define the full context (project, tech stack, constraints, existing patterns)
   - State the problem clearly with goals, sub-goals, and success criteria
   - Include deliverables, architecture considerations, and integration points
   - Be detailed enough that any senior engineer could execute it cold
   - Reference specific files, APIs, and data flows in the codebase where relevant

2. **Read it back** — Open and read the prompt file to confirm it's complete and correct.

3. **Execute it** — Carry out the prompt at an advanced expert level. Don't just plan — build, write code, create files, and deliver working results.

If no topic is provided, ask what the prompt should be about.
