# Issue branch binding

Issues may optionally bind a repository branch. When an Issue-linked run
starts and that binding is set (or inherited from the nearest ancestor), the
platform prepares the Git workspace from that branch instead of only the
workspace default base. Publish keeps a platform-assigned run branch; the pull
request targets the Issue branch as its merge base so child work can integrate
into the initiative line before that line merges to the repository default.
Code Grills materialize design-language files onto a remote branch at
completion and may write the same binding onto confirmed Issues — but the
binding is a general Issue capability, not Grill-only. We rejected keeping
branch identity only on Grill output or only on parent Issues: those hide the
seam agents need when dispatched, and force every multi-Issue initiative into
one inheritance rule. We also rejected treating the Issue branch as only a
start snapshot while still PRing into the repository default: that skips the
integration line the binding is meant to provide.
