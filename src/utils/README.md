# Utility modules

Keep helpers grouped by the domain they operate on. Import from the leaf module
that owns the behavior; avoid adding a root-level utility file or a broad barrel
export just to shorten import paths.

| Folder | Responsibility |
| --- | --- |
| `canvas/` | Canvas and edge geometry, including editable orthogonal routes. |
| `collections/` | Generic collection helpers such as sorting and set updates. |
| `data/` | Data validation, taxonomy, and wiki comparison. |
| `formatting/` | Display formatting for units and rates. |
| `graph/` | Graph traversal, group bounds, handle metadata, product resolution, and graph resolution context. |
| `ids/` | Node, edge, save, and handle identifiers. |
| `numeric/` | Precision policy, tolerances, and numeric cleanup used by calculations. |
| `recipes/` | Recipe availability, rate and quantity math, power, optimization metrics, modular machines, and machine-count constraints. |

Before extracting a helper, check `FUNCTION_CATALOG.md` for existing callers.
Share it when those callers need the same behavior and contract. Keep separate
functions when they differ in units, defaults, persistence rules, or domain
meaning, even if their implementations look similar.
