# Landing page tracking

Events pushed to `window.dataLayer` by `assets/landing.js` on pages built from the `landing-*` sections
(today: `/pages/the-initials`). GTM forwards them to GA4 through the existing trigger
"CE - tile tracking events" and tag "GA4 - tile tracking events"; nothing reaches GA4 for an event
name that trigger does not list.

They share the envelope of [collection tile tracking](collection-tile-tracking.md): `feature_version`
(`v2_tile_tracking`), `tile_collection` (the list id, `initials-landing`), and for product events the
GA4 `ecommerce.items[]` plus event-level copies (`tile_product_id`, `tile_price`,
`tile_discount_pct`, `tile_on_sale`, `position_served`, `position_shown`).

Every event states every page-specific field, `null` when it does not apply, so GTM never carries a
value over from the previous event.

## Events

| Event | Fires when | Fields beyond the envelope |
| --- | --- | --- |
| `tile_impression` | A card is at least half on screen. Once per card per page load. | `tile_material` |
| `select_item` | The details window opens for a card. | `tile_click_source` |
| `tile_quick_add_open` | The quick add window opens (card button "Add to cart"). | `tile_click_source` |
| `tile_variant_select` | A material swatch is picked, on the card or in a window. | `tile_material` |
| `tile_letter_select` | A letter is picked. | `tile_letter`, `tile_window` |
| `tile_image_swipe` | A photo row comes to rest on another slide. Once per gesture. | `image_index`, `media_type`, `tile_window` |
| `tile_image_zoom` | The full-screen viewer opens from the details window. | `image_index`, `media_type` |
| `tile_details_open` | "Materials + Care" or "Shipping + Returns" is opened. Not on close. | `details_name` |
| `tile_add_to_cart` | The theme confirms a single piece was added. | `tile_letter`, `tile_window`, `tile_material` |
| `landing_filter` | A filter button is used. | `filter_value` |
| `landing_section_view` | A section is on screen for the first time. Once per section per page load. | `section_name`, `section_index` |
| `landing_link_click` | A link inside a landing section or window is clicked. | `section_name`, `link_text`, `link_url` |
| `look_open` | "Shop the look" opens the look window. | `look_name`, `look_pieces`, `look_value`, `look_saving` |
| `look_add_to_cart` | Shopify confirms the look was added. | same as `look_open`, with the chosen variants in `items[]` |
| `landing_error` | An add to cart or a look add fails. | `error_message`, `tile_window` or `look_name` |

Shopify's own pixels still send `page_view`, `add_to_cart`, `begin_checkout` and `purchase`. The names
above are chosen not to collide with them.

## Field values

| Field | Values | Meaning |
| --- | --- | --- |
| `tile_window` | `card`, `quick_add`, `details` | Where the shopper was: on the card itself, in the short window with only material and letter, or in the full details window. |
| `tile_click_source` | `image`, `button`, `title`, `quick_add` | What opened the window: the card photo, the card's button or "See details" link, the product name, or the "See details" link inside the quick add window. |
| `media_type` | `photo`, `video` | The slide the event is about. |
| `details_name` | `materials`, `shipping` | |
| `section_name` | `hero`, `products`, `standard`, `looks`, `chapters`, `review`, `feature`, `closing`; for link clicks also `quick_view`, `look_window` | The section's role. Use this in reports. |
| `section_index` | 1, 2, 3... | DOM order of the `[data-landing-section]` elements. It changes when sections are reordered in the theme editor, so do not key reports on it. |
| `filter_value` | a group handle, or `all` | |
| `link_text` | text | Cut to 60 characters. |
| `error_message` | text | Shopify's message when there is one. Cut to 100 characters. |

## Things to know when reading the data

- A card photo opens the details window (`select_item` with `tile_click_source: image`). The zoom is
  reached only from inside that window, so `tile_image_zoom` is a second step, not a card click.
- Sold-out letters are disabled buttons; an attempt to pick one is not recorded.
- Express checkout skips the cart, so those orders have a purchase and no `tile_add_to_cart`.
- "Shop the look" adds two pieces in one request. Shopify reports one `add_to_cart` per piece at its
  own price; `look_add_to_cart` carries the look's price after the second-piece discount.
- GTM also sends `look_open` and `look_add_to_cart` to Meta as the custom events `ShopTheLook` and
  `AddLookToCart` (tag "Meta - look events"), through the pixel the Shopify app loads. Browser only.
