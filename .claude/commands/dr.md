# /dr — Deep Research

Strip the trigger. Use the rest of the user's message as the research topic: $ARGUMENTS

## Workflow

1. **Create a research brief** — Write a structured research brief to `workspace/prompts/` using kebab-case `.md` naming. The brief must define:
   - Research questions (primary + secondary)
   - Scope and boundaries
   - Source categories to check
   - Expected deliverables
   - Success criteria for thoroughness

2. **Read it back** — Open and read the brief to confirm completeness.

3. **Execute deep research:**
   - Search the web broadly for relevant pages and sources
   - Scrape and extract content from the most relevant URLs
   - Cross-reference multiple sources — never rely on a single page
   - Verify claims across independent sources where possible
   - Track source reliability and note conflicts between sources

4. **Save the report** — Write a structured research report to `workspace/research/` including:
   - Executive summary
   - Key findings (with confidence levels: high/medium/low)
   - Source URLs and key quotes
   - Conflicts or contradictions found
   - Recommendations and next steps
   - Raw source list with reliability notes

If no topic is provided, ask what to research.
