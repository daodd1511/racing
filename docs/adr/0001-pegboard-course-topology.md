# Course topology is a pegboard grid, not a spline

A Course is a chain of Modules snapped to a hole grid on a vertical Board,
viewed face-on, rather than obstacles placed along a global 3D centreline. The
first implementation used a single `COURSE_WAYPOINTS` spline with obstacles
pinned to arc-distances, which made insertion impossible without shifting every
downstream constant — the reason procedural assembly could not be built on it.
Grid placement makes connectivity a matter of Cell adjacency and overlap a
matter of Cell occupancy, both trivially correct, which is what makes generating
many Courses safe.

## Consequences

Depth becomes decoration rather than gameplay: Modules may lean into or out of
the Board (the vortex bowl needs exactly that) but the Course routes in x and y
only, and the camera pans without rotating. Free-3D course shapes are given up
deliberately.
