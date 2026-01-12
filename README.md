# Eventbrite Events Scraper

Extract event data from Eventbrite at scale. Collect event names, dates, times, prices, locations, categories, and direct ticket URLs from any Eventbrite search page.

## Features

- **Fast Data Extraction** — Optimized extraction from embedded page data for maximum speed
- **Flexible Search** — Filter by location, category, date range, or free events
- **Complete Event Data** — Names, descriptions, dates, times, prices, images, and ticket URLs
- **Automatic Pagination** — Seamlessly collects events across multiple pages
- **Deduplication** — Built-in duplicate removal ensures clean datasets
- **Proxy Support** — Configurable proxy settings for reliable scraping

## Use Cases

- Event aggregation and discovery platforms
- Market research on event trends
- Competitive analysis for event organizers
- Building event recommendation systems
- Academic research on live events
- Lead generation for event services

## Input Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `startUrls` | array | Direct Eventbrite search URLs to scrape | - |
| `search_query` | string | Search term (e.g., "music", "tech-conference") | `all-events` |
| `location` | string | Location (e.g., "online", "new-york", "london") | `online` |
| `category` | string | Category filter (business, music, tech, etc.) | All |
| `date_filter` | string | Date range (today, this-weekend, this-month) | Any |
| `is_free` | boolean | Only scrape free events | `false` |
| `results_wanted` | integer | Maximum events to collect | `100` |
| `max_pages` | integer | Maximum pages to process | `50` |
| `proxyConfiguration` | object | Proxy settings | Apify Proxy |

## Output Data

Each event record contains the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique Eventbrite event ID |
| `name` | string | Event title |
| `summary` | string | Event description |
| `url` | string | Event page URL |
| `image_url` | string | Event image URL |
| `start_date` | string | Start date (YYYY-MM-DD) |
| `start_time` | string | Start time |
| `end_date` | string | End date |
| `end_time` | string | End time |
| `timezone` | string | Event timezone |
| `is_online_event` | boolean | True if online event |
| `is_free` | boolean | True if free event |
| `price` | string | Ticket price or "Free" |
| `category` | string | Event category |
| `organizer_id` | string | Organizer ID |
| `tickets_url` | string | Direct ticket purchase URL |

## Example Output

```json
{
  "id": "123456789",
  "name": "Tech Innovation Summit 2026",
  "summary": "Join industry leaders for a day of insights on emerging technologies...",
  "url": "https://www.eventbrite.com/e/tech-innovation-summit-2026-tickets-123456789",
  "image_url": "https://img.evbuc.com/example-image.jpg",
  "start_date": "2026-02-15",
  "start_time": "09:00:00",
  "end_date": "2026-02-15",
  "end_time": "17:00:00",
  "timezone": "America/New_York",
  "is_online_event": false,
  "is_free": false,
  "price": "From $49.00",
  "category": "Science & Tech",
  "organizer_id": "987654321",
  "tickets_url": "https://www.eventbrite.com/checkout/123456789"
}
```

## Usage Examples

### Scrape Online Events

Collect all online events from Eventbrite:

```json
{
  "location": "online",
  "search_query": "all-events",
  "results_wanted": 500
}
```

### Scrape Music Events in New York

Find music events happening in New York this weekend:

```json
{
  "location": "new-york",
  "category": "music",
  "date_filter": "this-weekend",
  "results_wanted": 100
}
```

### Scrape Free Tech Events

Collect free technology and business events:

```json
{
  "location": "online",
  "category": "science-and-tech",
  "is_free": true,
  "results_wanted": 200
}
```

### Use Direct URL

Scrape from a specific Eventbrite search URL:

```json
{
  "startUrls": [
    { "url": "https://www.eventbrite.com/d/ca--san-francisco/tech-events/" }
  ],
  "results_wanted": 100
}
```

## Integrations

Connect the scraper output to your workflow:

- **Google Sheets** — Export events directly to spreadsheets
- **Webhooks** — Send data to your API endpoints
- **Zapier** — Automate workflows with 5000+ apps
- **Make (Integromat)** — Build complex automation scenarios
- **Slack** — Get notifications for new events
- **Email** — Receive event digests automatically

## Performance Tips

1. **Start Small** — Test with `results_wanted: 20` before large runs
2. **Use Filters** — Narrow down by category and date for faster results
3. **Proxy Configuration** — Residential proxies recommended for reliability
4. **Pagination Limits** — Set reasonable `max_pages` to control run time

## Cost Estimation

| Events | Estimated Time | Approximate Cost |
|--------|---------------|------------------|
| 100 | ~30 seconds | $0.01 |
| 1,000 | ~3 minutes | $0.05 |
| 5,000 | ~15 minutes | $0.20 |
| 10,000 | ~30 minutes | $0.40 |

*Costs are estimates and may vary based on proxy usage and platform load.*

## Frequently Asked Questions

### How often can I run this scraper?

You can run the scraper as often as needed. Consider using Apify Schedules for regular data collection.

### What locations are supported?

Any location available on Eventbrite including cities (e.g., "new-york", "london", "tokyo") and "online" for virtual events.

### Can I scrape private or password-protected events?

No, the scraper only collects publicly listed events visible on Eventbrite search pages.

### How do I get more event details?

The scraper extracts comprehensive data from search listings. For additional details like full descriptions or attendee counts, visit the event URL in the output.

### Why are some fields empty?

Field availability depends on what event organizers provide. Optional fields like `end_time` or `category` may be null if not specified by the organizer.

## Support

- **Issues**: Report bugs or request features in the Issues section
- **Documentation**: Check the Input Schema tab for detailed parameter descriptions
- **Updates**: Star this actor to receive notifications about updates

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring their use complies with Eventbrite's Terms of Service and applicable laws. Respect rate limits and avoid excessive requests.