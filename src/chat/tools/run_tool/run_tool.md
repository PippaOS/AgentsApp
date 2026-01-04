Run a DB-backed tool by id.

- tool_id: the tool public id (from the Tools UI)
- why: short explanation of why this tool is being used
- input: arbitrary JSON input for the tool (optional)

The tool's output can be any text written to stdout/stderr.
Optionally, the tool code may export default(input, ctx) which will be invoked.
