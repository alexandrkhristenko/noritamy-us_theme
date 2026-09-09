# Collection tile tracking

Per-product, per-position measurement of the collection grid: **impressions, clicks, quick-add
add-to-carts, wishlist**. Theme side is done; **GTM still needs the tags** or nothing reaches GA4.

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
| `add_to_wishlist` | via `window.NoritamyTiles.trackWishlist(productId)` | GA4 standard - no app wired yet |

Pushes use the GA4 ecommerce envelope, preceded by an `ecommerce: null` reset:

```js
dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'select_item',
  feature_version, position_served, position_shown, personalized,
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

**On measuring discount impact:** almost the whole US catalogue carries a compare-at price (287 of
288 storefront-visible products), so `on_sale` is near-constant and useless as a split. The variable
worth analysing is `discount_pct` - depth of discount against CTR and add-to-cart at equal position.

## The two positions

`snippets/visitor-personalization.liquid` reshuffles the grid client-side for returning visitors -
unseen products jump ahead of already-viewed ones within the top 70%. It is rendered **only on
`/collections/bracelets`** (`sections/main-collection.liquid`), on both IL and US.

That feature has never been measured: its `view_recently_viewed_section` and
`click_recently_viewed_item` dataLayer pushes have no GTM tag, so GA4 has recorded **zero** of them.
Logging both positions fixes that as a side effect - `personalized: true` is the exposure flag, and
CTR can finally be compared between shoppers who were reshuffled and shoppers who were not.

## GTM setup still required

Container `GTM-MDXMWV7K` (US) / `GTM-NFXS7F5F` (IL). For each of the four events:

1. Custom Event trigger on the event name.
2. GA4 Event tag, event name the same, with the `items` array mapped through and
   `position_served` / `position_shown` / `personalized` / `feature_version` as event parameters.
3. Register `position_served`, `position_shown`, `personalized`, `discount_pct`, `on_sale`,
   `compare_at_price` and `item_handle` as custom dimensions in GA4 - the rest are built in.

`index` is already set to `position_shown` in `items[]`, so GA4's own `itemListPosition` reflects
what the shopper actually saw rather than the served rank.

## Wishlist

No app is live. IL has Swym installed (`swymstore-v3starter-01`, v3starter tier) but it renders no
wishlist UI; US has no Swym at all. Once one is live, call
`window.NoritamyTiles.trackWishlist(productId)` from its add handler, or hook `swym.evtLayer`.

## Not done here

- IL theme. It runs the same code but is a separate store (`hrmjtw-34`) and is not checked out
  locally; the same two edits need porting.
- GTM tags (above).
- Search results and any other product grid outside `sections/main-collection.liquid`.
