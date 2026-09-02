## Git Worktrees
* Always use Git worktrees for development work. Never modify the primary working tree directly.
* By default, create the worktree from the main branch. If main does not exist, look for master.
* Create a dedicated branch for the worktree; do not work directly on main or master.
* Before creating the worktree, verify which base branch exists and ensure the worktree starts from the latest local state of that branch.
* Keep the worktree isolated from other worktrees and do not modify files outside it.
* After creating a new worktree, install dependencies with npm i
* Run tests, linting, builds, and other validation from the task worktree. 
