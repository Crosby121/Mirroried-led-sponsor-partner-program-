# Mirroried LED — Sponsor Benefits & Advertising Display Specification

**Status:** Owner-defined business requirements; implementation and negotiated commercial terms are not yet live.  
**Applies to:** Sponsor Partner Program and Advertising on the Go.  
**Not a promise of inventory, display time, or production capacity.**

## Two customer relationships

| | Sponsor Partner Program | Advertising on the Go |
| --- | --- | --- |
| What the business provides | Negotiated products, equipment, materials, services, **cash**, or a combination | Payment for approved advertising space/time |
| What Mirroried LED provides | A **negotiated sponsorship package** including a promotional video for approved social channels, approved logo/creative appearances on its vehicle/showroom network, negotiated advertising display space, **and a customized infinity mirror showing the sponsor's approved image** | Only the purchased advertising placement and the campaign handling/proof explicitly included in its selected package |
| Custom infinity mirror included? | **Yes, one is a proposed core sponsor deliverable; design and size must be agreed before the contract is executed** | **No**, unless separately purchased or contracted |
| Vehicle/showroom physical branding | Only the locations and terms written into the sponsor agreement | Not implied by an advertising booking |
| Sponsor social video | Production and posting as specified and approved in the sponsor agreement | Not included in basic paid display space |
| Account and financial model | Accepted contribution with value and allocated sponsor fulfillment | Paid booking, package entitlement, inventory and verified payment |
| Approval | Negotiated written agreement and creative/fabrication approval | Purchase and creative/display approval |

**Do not equate cash sponsorship with standard paid ad booking.** A sponsor's combination of cash and in-kind resources may secure a custom package, but it must be agreed in writing. An advertiser purchases inventory and does not receive the sponsor mirror, vehicle branding, or social video automatically.

## Sponsor agreement data to capture

1. Legal sponsor business, representative/contact, email, company website and business category.
2. Contributions: cash amount, currency, installment dates, product/material/equipment list, agreed quantities and condition, service description/hours, delivery schedule, and **Mirroried LED's accepted contribution value**. Record offered and accepted values separately.
3. Promotional video: outline/script, video duration, approved media/music/logos, editing and approval rounds, platform/account(s), number of posts, publish date/window, disclosure requirements, link/tag and proof URL or screenshot. Publication is promised only for channels and dates Mirroried LED actually controls.
4. Vehicle/showroom branding: location (truck, trailer, van, mobile showroom), physical/digital surface, creative dimensions and format, installation/activation and removal windows, permission and safety review, quantity and proof.
5. Sponsored advertising-space allocation: approved event/date/window, screen or network asset, duration, loop/repetition where agreed, approved creative, allocated value and proof. No speculative impressions or 24/7 availability.
6. **Customized infinity mirror:** sponsor-approved logo/photo/image, artwork rights, engraved/backlit design, mirror dimensions (width × height × depth), frame material/color, LED/backlight/controller choices, quantity (initially one, unless negotiated otherwise), concept/render approval, fabrication lead time, pickup/shipping/install, warranty, acceptance criteria, and internal cost. **Size is not predetermined; finalize it during negotiation.** Never manufacture or quote a default size without approval.
7. Pricing and scope controls: package value, placement-value ceiling from existing commerce rules, separately costed mirror and content deliverables, any cash co-payment or additional work, milestones, cancellation and change-control terms.
8. Approvals and proof: authorized contacts, content review, accepted artwork, signed scope, delivery status, photos/video links, audience metrics **only if verified**, and closeout report.

## HUB75/HUB75E display-compatibility requirements

Mirroried LED controls playback. Partners and advertisers **supply media**, not arbitrary LED-driver software. An offered software product is a separate in-kind contribution and is not assumed to control Mirroried LED hardware.

- Inventory records must specify whether the actual display is HUB75 or HUB75E, module pixel dimensions/pitch, scan ratio, driver IC, controller and validated firmware. This is especially important for the existing P3.19 64×64 1/16-scan HUB75E inventory.
- Before approving a slot, check the **installed, working** controller-to-panel mapping and power/thermal limits; do not describe untested panel/controller combinations as plug-and-play.
- Collect sponsor/advertiser images and videos in a common ingest format with rights clearance. Normalize resolution, color, aspect ratio, orientation, crop, frame rate, file size and playback duration to the *verified output dimensions* of the chosen panel wall or vehicle display.
- Media preview must show safe areas, legibility, contrast and motion. Escalate strobing/rapid flashes, safety restrictions, copyrighted audio and trademark permissions for approval.
- Content delivery/publish confirmation must come from the playback/display system or an operator's verified proof record. Upload alone does not prove an ad displayed.
- Keep device IPs, controller credentials, MQTT topics, route planning and fleet details inaccessible to sponsors and advertisers.

## Execution boundaries

- The Advertising on the Go page and its **five planned day-based tiers** are intentionally deferred. Do not publish tier prices, durations or booking guarantees without the rate card and inventory signoff.
- The sponsor mirror size and image are part of **negotiation**, not the signup screen.
- This specification does not implement account signup, email verification, authorization, payment or billing.
- No live vehicle ad slots or HUB75 configurations are being changed by this document.
