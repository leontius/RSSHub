const got = require('@/utils/got');
const cheerio = require('cheerio');
const timezone = require('@/utils/timezone');
const { parseDate } = require('@/utils/parse-date');
const { art } = require('@/utils/render');
const path = require('path');
const logger = require('@/utils/logger');

module.exports = async (ctx) => {
    let category = ctx.params.category ?? '';
    let domain = ctx.query.domain ?? 'btbtt20.com';

    if (category === 'base') {
        category = '';
        domain = '88btbtt.com';
    } else if (category === 'govern') {
        category = '';
        domain = '2btjia.com';
    }

    const rootUrl = `https://www.${domain}`;
    const currentUrl = `${rootUrl}${category ? `/${category}.htm` : ''}`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = cheerio.load(response.data);

    if (currentUrl.indexOf('thread') !== -1) {
        logger.info(currentUrl + ' url has torrent detail.');

        const results = [];
        $('#body div')
            .find('.post_table')
            .toArray()
            .map((itm) => {
                const attachlist = $(itm);
                const torrents = attachlist.find('.attachlist').find('a');
                if (torrents.length > 0) {
                    torrents.each((i, t) => {
                        const html = $(t).html();
                        const torrentName = $(t).text();
                        const torrentLink = `${rootUrl}/${$(t)
                            .attr('href')
                            .replace(/^attach-dialog/, 'attach-download')}`;

                        results.push({
                            title: html,
                            description: torrentName,
                            enclosure_type: 'application/x-bittorrent',
                            enclosure_url: torrentLink,
                        });
                    });
                }
                return null;
            });
        ctx.state.data = {
            title: `${$('#menu')
                .find('.checked')
                .toArray()
                .map((c) => $(c).text())
                .filter((c) => c !== '全部')
                .join('|')} - BT之家`,
            link: currentUrl,
            item: results,
        };
        return;
    }

    $('.bg2').prevAll('table').remove();

    let items = $('#threadlist table')
        .toArray()
        .map((item) => {
            const a = $(item).find('.subject_link');

            return {
                title: a.text(),
                link: `${rootUrl}/${a.attr('href')}`,
            };
        });

    items = await Promise.all(
        items.map((item) =>
            ctx.cache.tryGet(item.link, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: item.link,
                });

                const content = cheerio.load(detailResponse.data);

                content('h2, .message').remove();

                content('.attachlist')
                    .find('a')
                    .each(function () {
                        content(this)
                            .children('img')
                            .attr('src', `${rootUrl}${content(this).children('img').attr('src')}`);
                        content(this).attr(
                            'href',
                            `${rootUrl}/${content(this)
                                .attr('href')
                                .replace(/^attach-dialog/, 'attach-download')}`
                        );
                    });

                const torrents = content('.attachlist').find('a');

                item.description = content('.post').html();
                item.author = content('.purple, .grey').first().prev().text();
                item.pubDate = timezone(parseDate(content('.bg2 b').first().text()), +8);

                if (torrents.length > 0) {
                    item.description += art(path.join(__dirname, 'templates/torrents.art'), {
                        torrents: torrents.toArray().map((t) => content(t).parent().html()),
                    });
                    item.enclosure_type = 'application/x-bittorrent';
                    item.enclosure_url = torrents.first().attr('href');
                }

                return item;
            })
        )
    );

    ctx.state.data = {
        title: `${$('#menu, #threadtype')
            .find('.checked')
            .toArray()
            .map((c) => $(c).text())
            .filter((c) => c !== '全部')
            .join('|')} - BT之家`,
        link: currentUrl,
        item: items,
    };
};
