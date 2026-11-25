# OD-014 — Tutor cancellation reason policy

**Status: accepted in [PR #131](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/131) after Chxtamos reviewed the exact policy commit, including the Unicode-letter rule, 500-code-point bound and TCAN-04 fixtures.** Issue [#117](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/117) implements the accepted policy. This document is the decision record, not verification evidence. The contract and STS baseline were reviewed in [PR #126](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/126); the shared transition foundation was reviewed in [PR #128](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/128). This proposal is based on the current Sprint 2 integration after [PR #130](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/130), not the historical Sprint 1 integration reference.

Sources: [SRS](../../srs.md) (Q20, FR-029, BR-020, VAL-021 and OD-014), [feature specification](specification.md), [API contract](api-spec.md), [UI contract](ui-spec.md) and [STS](tests.md).

## Accepted decision

- Accept a JSON string only. Trim leading and trailing whitespace on the server using JavaScript `String.prototype.trim()`, then validate the trimmed value.
- The trimmed value must contain at least one Unicode letter (general category `Letter`), have at most **500 Unicode code points**, and contain no U+0000. Reject malformed UTF-16 (unpaired surrogate code units) before passing text to PostgreSQL so the submitted scalars are not silently replaced. Count scalar text as code points, not JavaScript UTF-16 code units, bytes or grapheme clusters. Thai and other scripts are supported. Keep valid punctuation, numbers, emoji, and internal spacing; preserve the trimmed string without applying Unicode normalization.
- Requiring a letter is a deterministic minimum for “meaningful”: punctuation-only, emoji-only and numeric-only filler is rejected. It is not a claim that every sentence is meaningful. Do not require a dictionary, minimum word count, language detection or an external classifier.
- Invalid input returns the existing safe `400 INVALID_INPUT` response without echoing the reason. Booking, Slot and Notification must remain unchanged. Validate before entering the mutation; valid input still requires the assigned Tutor, an active Booking, the post-lock `>= 60 minutes` cutoff and the existing atomic database path.
- Give the Tutor a short, localizable hint about who can see the reason and the limit. Client validation can guide entry; the server is authoritative. Render accepted reasons as plain text wherever the owning Customer is already authorized to see them. Do not include the reason in a Tutor response, error body, log, analytics event or non-owner view.

## STS delta

Keep `TCAN-01..14` and their existing identifiers. Expand **TCAN-04 / AC-S2-03-04 / VAL-021** with these fixtures:

| Input | Expected |
| --- | --- |
| Missing, null, non-string, empty, spaces, tab/newline only | 400; no committed change |
| Punctuation only, zero-width characters only, emoji only, or digits only | 400; no committed change |
| Text containing U+0000 or an unpaired surrogate | 400 before PostgreSQL receives it; no committed change |
| `"  ติดธุระช่วงเวลานี้ครับ  "` | Accepted if other preconditions hold; only the trimmed text is stored |
| A leading letter followed by 499 one-code-point emoji, then the same fixture with one more emoji | 500 accepted; 501 rejected with no change |

Use separate eligible Booking fixtures for accepted cases and verify stored text, withdrawn Slot, and exactly one notice. For rejected cases, verify the original Booking and Slot states and zero notices through a separate connection. Keep TCAN-11's privacy assertions for success and error paths.

## Review and handoff

Chxtamos explicitly agreed on the Unicode-letter rule, maximum length and TCAN-04 outcomes in [PR #131](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/131). This decision does not change the 60-minute rule, the reviewed migration, the notification-read feature (#118), or any production data. The implementation PR is reviewed separately.
