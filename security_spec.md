# Security Specification: Wedding RSVP

## Data Invariants
1. An RSVP must contain a valid `fullName`, `isAttending`, `guestsCount`, and `uid`.
2. The `uid` of the document must match the `request.auth.uid` of the user creating it.
3. Visitors can create RSVPs (using anonymous authentication) but cannot list or read all RSVPs to protect guest privacy.
4. Users can only read or update their own RSVP.

## The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: Missing `request.auth` entirely.
2. **Missing Required Field**: Payload missing `fullName`.
3. **Identity Spoofing**: Payload `uid` does not match `request.auth.uid`.
4. **Invalid Type**: `guestsCount` passed as a string `"2"` instead of a number.
5. **Boundary Violation**: `guestsCount` is negative or over 20.
6. **Data Size Violation**: `fullName` is an artificially massive string > 200 chars.
7. **Timestamp Tampering**: Payload `createdAt` is a client-provided past/future timestamp instead of `request.time`.
8. **Ghost Field**: Payload includes unapproved field `isAdmin: true`.
9. **Update Locked Field**: Attempting to alter `createdAt` on an `update`.
10. **Unauthorized Read**: Attempting to list the `rsvps` collection.
11. **Cross-User Tampering**: Attempting to update another guest's (different `uid`) RSVP document.
12. **Wrong Role Update**: Modifying RSVP state after submission without permission.
