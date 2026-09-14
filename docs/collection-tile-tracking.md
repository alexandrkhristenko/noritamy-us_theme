# Collection tile tracking

Per-product, per-position measurement of the collection grid: **impressions, clicks, quick-add
add-to-carts, wishlist**. Live on Noritamy US and IL; GTM forwards the events to GA4.

## Why the theme and not the Shopify pixel

Shopify's Google & YouTube channel pixel already sends `view_item_list`, but its
`item_list_position` is the index **within the loaded batch** and never exceeds 23 - a product at
real rank #37 reports position 10. It never sends `select_item` at all, which is why
`itemsClickedInList` is 0 on both stores. Positions and clicks can only come from the DOM.

## Events pushed to `window.dataLayer`

| Event | When | Why this name |
|---|---|---|
| `tile_impression` | tile 50% visible, once per page view | custom: reusing `view_item_list` would double-count against the Shopify pixel |
| `select_item` | click on a tile (quick-add excluded) | GA4 standard - nothing else emits it, so `itemsClickedInList` / `itemListPosition` populate for free |
| `tile_add_to_cart` | quick-add succeeds on a tile | custom: the Shopify pixel already sends `add_to_cart` |
| `add_to_wishlist` | shopper saves a product with the Swym heart on a tile (IL) | GA4 standard - nothing else emits it |

Pushes use the GA4 ecommerce envelope, preceded by an `ecommerce: null` reset:

```js
dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'select_item',
  feature_version, position_served, position_shown, personalized,
  tile_product_id, tile_collection, tile_price, tile_discount_pct, tile_on_sale,
  ecommerce: { currency, item_list_name, item_list_id, items: [ /* below */ ] }
});
```

Each `items[]` entry:

```
item_id, item_variant, item_name, item_handle,
price,              // the card variant's price - what the shopper sees
compare_at_price,   // null when the item is not discounted
discount,           // GA4 standard, per unit: compare_at_price - price
discount_pct,       // 0-100, rounded
on_sale,            // boolean
index,              // = position_shown, so GA4's own itemListPosition is what was seen
item_list_name, item_list_id,
position_served,    // rank Shopify rendered - the merchandised order
position_shown,     // DOM index at event time, after visitor-personalization reshuffles
personalized,       // position_shown !== position_served
page
```

`price`, `discount`, `index`, `item_list_name`, `item_list_id` and `item_variant` are GA4 standard
item parameters. `compare_at_price`, `discount_pct`, `on_sale`, `item_handle`, `position_served`,
`position_shown` and `personalized` are custom and need registering as custom dimensions.

## Event-level product fields (`feature_version: v2_tile_tracking`)

GA4's reporting API **cannot break a custom event down by anything inside `items[]`**. Against
`eventCount` for `tile_impression`, `tile_add_to_cart` or `add_to_wishlist`, the dimensions `itemId`,
`itemName`, `itemListName` and every `customItem:*` return `400 incompatible` (verified 2026-09-10 and
again 2026-09-14 on both properties). Item-scoped dimensions only combine with GA4's built-in item
metrics, e.g. `itemsClickedInList` for `select_item`. Without event-level copies there is no way to get
per-product impressions, and so no per-product CTR, out of the Data API.

So every push also carries, at event level:

| Parameter | Value |
|---|---|
| `tile_product_id` | `items[0].item_id` |
| `tile_collection` | collection handle (`item_list_id`) - a stable key, unlike Hebrew list names |
| `tile_price` | `items[0].price` |
| `tile_discount_pct` | `items[0].discount_pct` |
| `tile_on_sale` | `items[0].on_sale` |

The `tile_` prefix avoids collisions with GA4's built-in item dimensions and with the item-scoped
`discount_pct` / `on_sale` custom dimensions. Events before `v2_tile_tracking` do not have these.

**On discount analysis:** check live pricing first. On 2026-09-08 nearly every US product carried a
compare-at price; by 2026-09-10 most US compare-at prices had been removed (1 of the first 24 bracelets).
Compare-at coverage changes with promotions, so `tile_on_sale` and `tile_discount_pct` are only
meaningful against the pricing that was live on the day.

## The two positions

`snippets/visitor-personalization.liquid` reshuffles the grid client-side for returning visitors -
unseen products jump ahead of already-viewed ones within the top 70%. It is rendered **only on
`/collections/bracelets`** (`sections/main-collection.liquid`), on both IL and US.

That feature has never been measured: its `view_recently_viewed_section` and
`click_recently_viewed_item` dataLayer pushes have no GTM tag, so GA4 has recorded **zero** of them.
Logging both positions fixes that as a side effect - `personalized: true` is the exposure flag, and
CTR can finally be compared between shoppers who were reshuffled and shoppers who were not.

## GTM and GA4 setup

Containers `GTM-MDXMWV7K` (US, `G-N35YQ67G69`), `GTM-NFXS7F5F` (IL, `G-ZPHRK4JN2R`),
`GTM-KDV57Z6V` (Annoory, `G-564DGYR364`). In each:

1. **Data Layer Variables** (version 2): `position_served`, `position_shown`, `personalized`,
   `feature_version`, `tile_product_id`, `tile_collection`, `tile_price`, `tile_discount_pct`,
   `tile_on_sale`.
2. **One Custom Event trigger**, regex on:
   `^(tile_impression|select_item|tile_add_to_cart|add_to_wishlist)$`
3. **One GA4 Event tag**: Event Name `{{Event}}`, Send Ecommerce data from the Data Layer, the nine
   variables above as event parameters.
4. **GA4 custom dimensions**: event-scoped for the nine parameters above; item-scoped for
   `compare_at_price`, `discount_pct`, `on_sale`, `item_handle`.

`index` is already set to `position_shown` in `items[]`, so GA4's own `itemListPosition` reflects
what the shopper actually saw rather than the served rank.

## Wishlist

**Noritamy IL:** Swym Wishlist Plus renders a heart (`button.swym-advanced-wishlist-collections`) on
every product tile. This Swym version fires no "added" event - a successful add re-renders the heart
with `aria-pressed="true"`, sometimes seconds later behind a consent popup or variant picker, and page
load renders already-saved products as pressed too. The snippet therefore arms on a click of an
**unpressed** heart and reports `add_to_wishlist` when that tile's heart turns pressed (2 min window).
Clicks on a pressed heart (removal, or opening the drawer) are not counted. The heart is a real
`<button>`, so it never triggers `select_item`.

**Noritamy US:** no wishlist app, the hook is inert. `window.NoritamyTiles.trackWishlist(productId)`
remains available for any other integration.

## Not done here

- Annoory: Prestige 10.7.0 theme, different grid markup - needs its own implementation.
- Search results and any other product grid outside `sections/main-collection.liquid`.
