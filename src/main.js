// Eventbrite Events Scraper - CheerioCrawler implementation
// Priority: 1) __SERVER_DATA__ JSON  2) JSON-LD  3) HTML parsing
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            search_query = 'all-events',
            location = 'online',
            category = '',
            date_filter = '',
            is_free = false,
            results_wanted: RESULTS_WANTED_RAW = 20,
            max_pages: MAX_PAGES_RAW = 5,
            startUrl,
            startUrls,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 20;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 5;

        // Build Eventbrite search URL
        const buildStartUrl = (query, loc, cat, dateF, free) => {
            // Base URL pattern: https://www.eventbrite.com/d/{location}/{category--}events{--date}/?page=1
            let path = loc || 'online';

            // Build query path
            let queryPath = '';
            if (cat) queryPath += `${cat}--`;
            if (free) queryPath += 'free--';
            queryPath += query || 'all-events';
            if (dateF) queryPath += `--${dateF}`;

            return `https://www.eventbrite.com/d/${path}/${queryPath}/`;
        };

        // Collect start URLs
        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) {
            startUrls.forEach(u => {
                if (typeof u === 'string') initial.push(u);
                else if (u?.url) initial.push(u.url);
            });
        }
        if (startUrl) initial.push(startUrl);
        if (!initial.length) initial.push(buildStartUrl(search_query, location, category, date_filter, is_free));

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        const seenIds = new Set();

        // Clean Eventbrite image URLs - extract original CDN URL
        function cleanImageUrl(url) {
            if (!url) return null;

            // Check if it's a proxied URL like: https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2F...
            if (url.includes('img.evbuc.com/https')) {
                try {
                    // Extract the encoded URL part after img.evbuc.com/
                    const match = url.match(/img\.evbuc\.com\/(https?%3A%2F%2F[^?]+)/);
                    if (match && match[1]) {
                        // Decode the URL
                        let decoded = decodeURIComponent(match[1]);
                        return decoded;
                    }
                } catch (e) {
                    // If decoding fails, return original
                }
            }

            // Remove query parameters for cleaner URL if it's already a CDN URL
            if (url.includes('cdn.evbuc.com')) {
                try {
                    const urlObj = new URL(url);
                    return urlObj.origin + urlObj.pathname;
                } catch (e) {
                    // Return original if parsing fails
                }
            }

            return url;
        }

        // Format price from various data structures
        function formatPrice(event) {
            // Check if free
            if (event.is_free || event.isFree) {
                return 'Free';
            }

            // Check for minPrice object structure (from React state)
            if (event.minPrice) {
                const minVal = event.minPrice.minPriceValue;
                const currency = event.minPrice.currency || 'USD';
                if (minVal !== undefined && minVal !== null) {
                    // minPriceValue is often in cents (e.g., 2300 = $23.00)
                    const amount = minVal >= 100 ? (minVal / 100).toFixed(2) : minVal.toFixed(2);
                    const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency + ' ';
                    return `From ${symbol}${amount}`;
                }
            }

            // Check for ticket_availability structure
            if (event.ticket_availability?.minimum_ticket_price?.display) {
                return event.ticket_availability.minimum_ticket_price.display;
            }

            // Check for direct price field
            if (event.price) {
                return event.price;
            }

            return null;
        }

        // Extract __SERVER_DATA__ from script tags (Priority 1)
        function extractServerData($) {
            const scripts = $('script');
            for (let i = 0; i < scripts.length; i++) {
                const content = $(scripts[i]).html() || '';
                // Look for window.__SERVER_DATA__ assignment
                const match = content.match(/window\.__SERVER_DATA__\s*=\s*(\{[\s\S]*?\});?\s*(?:window\.|<\/script|$)/);
                if (match && match[1]) {
                    try {
                        // Clean up the JSON string
                        let jsonStr = match[1];
                        // Handle trailing semicolons and clean up
                        jsonStr = jsonStr.replace(/;$/, '').trim();
                        const data = JSON.parse(jsonStr);

                        if (data?.search_data?.events) {
                            const eventsData = data.search_data.events;

                            // Merge results and promoted_results for more complete data
                            // promoted_results often has more fields like primary_organizer and ticket_availability
                            const allEvents = [];
                            const seenEventIds = new Set();

                            // Add promoted_results first (they have more complete data)
                            if (eventsData.promoted_results?.length) {
                                for (const event of eventsData.promoted_results) {
                                    if (event.id && !seenEventIds.has(event.id)) {
                                        seenEventIds.add(event.id);
                                        allEvents.push(event);
                                    }
                                }
                            }

                            // Then add regular results
                            if (eventsData.results?.length) {
                                for (const event of eventsData.results) {
                                    if (event.id && !seenEventIds.has(event.id)) {
                                        seenEventIds.add(event.id);
                                        allEvents.push(event);
                                    }
                                }
                            }

                            // Get profiles map for organizer name lookup
                            const profiles = data.search_data.profiles || {};

                            return {
                                events: allEvents,
                                profiles: profiles,
                                pagination: eventsData.pagination || {}
                            };
                        }
                    } catch (e) {
                        log.debug(`Failed to parse __SERVER_DATA__: ${e.message}`);
                    }
                }
            }
            return null;
        }

        // Extract JSON-LD structured data (Priority 2)
        function extractJsonLd($) {
            const events = [];
            const scripts = $('script[type="application/ld+json"]');

            scripts.each((_, script) => {
                try {
                    const data = JSON.parse($(script).html() || '');

                    // Handle ItemList containing Events
                    if (data['@type'] === 'ItemList' && data.itemListElement) {
                        data.itemListElement.forEach(item => {
                            const event = item.item || item;
                            if (event['@type'] === 'Event') {
                                events.push({
                                    name: event.name || null,
                                    summary: event.description || null,
                                    url: event.url || null,
                                    image_url: typeof event.image === 'string' ? event.image : event.image?.url || null,
                                    start_date: event.startDate ? event.startDate.split('T')[0] : null,
                                    start_time: event.startDate?.includes('T') ? event.startDate.split('T')[1]?.replace('Z', '') : null,
                                    end_date: event.endDate ? event.endDate.split('T')[0] : null,
                                    end_time: event.endDate?.includes('T') ? event.endDate.split('T')[1]?.replace('Z', '') : null,
                                    is_online_event: event.eventAttendanceMode?.includes('Online') || false,
                                    location: event.location?.name || (event.location?.['@type'] === 'VirtualLocation' ? 'Online' : null),
                                });
                            }
                        });
                    }

                    // Handle single Event
                    if (data['@type'] === 'Event') {
                        events.push({
                            name: data.name || null,
                            summary: data.description || null,
                            url: data.url || null,
                            image_url: typeof data.image === 'string' ? data.image : data.image?.url || null,
                            start_date: data.startDate ? data.startDate.split('T')[0] : null,
                            start_time: data.startDate?.includes('T') ? data.startDate.split('T')[1]?.replace('Z', '') : null,
                            end_date: data.endDate ? data.endDate.split('T')[0] : null,
                            end_time: data.endDate?.includes('T') ? data.endDate.split('T')[1]?.replace('Z', '') : null,
                            is_online_event: data.eventAttendanceMode?.includes('Online') || false,
                            location: data.location?.name || (data.location?.['@type'] === 'VirtualLocation' ? 'Online' : null),
                        });
                    }
                } catch (e) {
                    log.debug(`Failed to parse JSON-LD: ${e.message}`);
                }
            });

            return events.length > 0 ? events : null;
        }

        // Extract from HTML (Priority 3 - Fallback)
        function extractFromHtml($) {
            const events = [];

            // Try multiple selectors for event cards
            const cardSelectors = [
                '[data-testid="search-event"]',
                'section.discover-vertical-event-card',
                '.event-card-link',
                '[data-event-id]'
            ];

            let cards = $();
            for (const selector of cardSelectors) {
                cards = $(selector);
                if (cards.length > 0) break;
            }

            cards.each((_, card) => {
                const $card = $(card);

                // Find the link
                const linkEl = $card.is('a') ? $card : $card.find('a.event-card-link, a[href*="/e/"]').first();
                const url = linkEl.attr('href') || null;

                // Extract title
                const title = $card.find('h3, h2, [data-testid="event-title"]').first().text().trim() || null;

                // Extract image
                const img = $card.find('img').first();
                const rawImgUrl = img.attr('src') || img.attr('data-src') || null;
                const image_url = cleanImageUrl(rawImgUrl);

                // Extract date/time text
                const dateText = $card.find('p, time, [data-testid="event-date"]').first().text().trim() || null;

                // Extract price
                let price = null;
                let is_free = false;
                const priceText = $card.text();
                if (/free/i.test(priceText)) {
                    is_free = true;
                    price = 'Free';
                } else {
                    // Match various currency formats: $, £, €
                    const priceMatch = priceText.match(/(?:from\s*)?[$£€][\d,.]+/i);
                    if (priceMatch) price = priceMatch[0];
                }

                // Extract event ID from URL
                let id = null;
                if (url) {
                    const idMatch = url.match(/\/e\/[^/]+-(\d+)/);
                    if (idMatch) id = idMatch[1];
                }

                if (title || url) {
                    events.push({
                        id,
                        name: title,
                        url: url ? (url.startsWith('http') ? url : `https://www.eventbrite.com${url}`) : null,
                        image_url,
                        date_text: dateText,
                        price,
                        is_free,
                    });
                }
            });

            return events.length > 0 ? events : null;
        }

        // Transform __SERVER_DATA__ event to output format
        function transformServerEvent(event, profiles = {}) {
            const tags = event.tags || [];
            const categoryTag = tags.find(t => t.prefix === 'EventbriteCategory' || t.display_name);

            // Get image URL and clean it
            const rawImageUrl = event.image?.url || event.primary_image?.url || event.imageUrl || null;

            // Extract organizer name from multiple possible sources
            let organizerName = null;
            // First try primary_organizer object (available in promoted_results)
            if (event.primary_organizer?.name) {
                organizerName = event.primary_organizer.name;
            }
            // Then try direct organizerName field
            else if (event.organizerName) {
                organizerName = event.organizerName;
            }
            // Finally try profiles lookup using primary_organizer_id
            else if (event.primary_organizer_id && profiles[event.primary_organizer_id]) {
                const profile = profiles[event.primary_organizer_id];
                organizerName = profile.name || profile.display_name || null;
            }

            // Extract price from ticket_availability or other sources
            let price = null;
            let isFree = event.is_free || event.isFree || false;

            // Check ticket_availability (most reliable)
            if (event.ticket_availability) {
                const ta = event.ticket_availability;
                if (ta.is_free) {
                    isFree = true;
                    price = 'Free';
                } else if (ta.minimum_ticket_price?.display) {
                    price = ta.minimum_ticket_price.display;
                } else if (ta.minimum_ticket_price?.value !== undefined) {
                    // Value is in cents, convert to display format
                    const val = ta.minimum_ticket_price.value;
                    const currency = ta.minimum_ticket_price.currency || 'USD';
                    const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency + ' ';
                    const amount = (val / 100).toFixed(2);
                    price = `From ${symbol}${amount}`;
                }
            }

            // Fallback to formatPrice for other structures
            if (!price && !isFree) {
                price = formatPrice(event);
            }

            if (isFree && !price) {
                price = 'Free';
            }

            return {
                id: event.id || null,
                name: event.name || null,
                summary: event.summary || null,
                url: event.url || null,
                image_url: cleanImageUrl(rawImageUrl),
                start_date: event.start_date || event.startDate || null,
                start_time: event.start_time || event.startTime || null,
                end_date: event.end_date || event.endDate || null,
                end_time: event.end_time || event.endTime || null,
                timezone: event.timezone || null,
                is_online_event: event.is_online_event || event.isOnlineEvent || false,
                is_free: isFree,
                price: price,
                category: categoryTag?.display_name || null,
                organizer_id: event.primary_organizer_id || event.primary_organizer?.id || null,
                organizer_name: organizerName,
                tickets_url: event.tickets_url || null,
            };
        }

        // Find next page URL
        function findNextPage($, currentUrl, currentPage, maxPage) {
            if (currentPage >= maxPage) return null;

            // Parse current URL and add/update page parameter
            try {
                const url = new URL(currentUrl);
                const nextPage = currentPage + 1;
                url.searchParams.set('page', nextPage);
                return url.href;
            } catch {
                return null;
            }
        }

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 5,
            requestHandlerTimeoutSecs: 60,
            additionalMimeTypes: ['application/json'],

            async requestHandler({ request, $, log: crawlerLog }) {
                const pageNo = request.userData?.pageNo || 1;

                if (saved >= RESULTS_WANTED) {
                    crawlerLog.info(`Reached target of ${RESULTS_WANTED} events. Stopping.`);
                    return;
                }

                crawlerLog.info(`Processing page ${pageNo}: ${request.url}`);

                let events = [];
                let totalPages = MAX_PAGES;
                let source = 'unknown';

                // Priority 1: Try __SERVER_DATA__
                const serverData = extractServerData($);
                if (serverData?.events?.length) {
                    const profiles = serverData.profiles || {};
                    events = serverData.events.map(e => transformServerEvent(e, profiles));
                    totalPages = Math.min(serverData.pagination?.page_count || MAX_PAGES, MAX_PAGES);
                    source = '__SERVER_DATA__';
                    crawlerLog.info(`Extracted ${events.length} events from __SERVER_DATA__ (page ${pageNo}/${totalPages})`);
                }

                // Priority 2: Try JSON-LD
                if (!events.length) {
                    const jsonLdEvents = extractJsonLd($);
                    if (jsonLdEvents?.length) {
                        events = jsonLdEvents;
                        source = 'JSON-LD';
                        crawlerLog.info(`Extracted ${events.length} events from JSON-LD`);
                    }
                }

                // Priority 3: Try HTML parsing
                if (!events.length) {
                    const htmlEvents = extractFromHtml($);
                    if (htmlEvents?.length) {
                        events = htmlEvents;
                        source = 'HTML';
                        crawlerLog.info(`Extracted ${events.length} events from HTML`);
                    }
                }

                if (!events.length) {
                    crawlerLog.warning(`No events found on page ${pageNo}`);
                    return;
                }

                // Deduplicate and save events
                const toSave = [];
                for (const event of events) {
                    if (saved >= RESULTS_WANTED) break;

                    const eventId = event.id || event.url || event.name;
                    if (eventId && seenIds.has(eventId)) continue;
                    if (eventId) seenIds.add(eventId);

                    toSave.push({
                        ...event,
                        _source: 'eventbrite',
                        _extraction_method: source,
                    });
                    saved++;
                }

                if (toSave.length) {
                    await Dataset.pushData(toSave);
                    crawlerLog.info(`Saved ${toSave.length} events (total: ${saved}/${RESULTS_WANTED})`);
                }

                // Enqueue next page if needed
                if (saved < RESULTS_WANTED && pageNo < totalPages && pageNo < MAX_PAGES) {
                    const nextUrl = findNextPage($, request.url, pageNo, totalPages);
                    if (nextUrl) {
                        await crawler.addRequests([{
                            url: nextUrl,
                            userData: { pageNo: pageNo + 1 }
                        }]);
                    }
                }
            },

            async failedRequestHandler({ request, log: crawlerLog }) {
                crawlerLog.error(`Request failed: ${request.url}`);
            }
        });

        log.info(`Starting Eventbrite scraper with ${initial.length} start URL(s)`);
        log.info(`Target: ${RESULTS_WANTED} events, max ${MAX_PAGES} pages`);

        await crawler.run(initial.map(u => ({ url: u, userData: { pageNo: 1 } })));

        log.info(`Finished. Saved ${saved} events`);

    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
