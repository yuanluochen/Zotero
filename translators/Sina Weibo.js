{
	"translatorID": "231208c0-1a69-4f58-b0f7-4a78e5e057a5",
	"label": "Sina Weibo",
	"creator": "pixiandouban, jiaojiaodubai",
	"target": "^https?://.*weibo\\.com/",
	"minVersion": "4.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2024-02-03 14:24:01"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Weibo Translator
	Copyright © 2020-2021 pixiandouban, 2023 jiaojiaodubai
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.
	
		  ***** END LICENSE BLOCK *****
*/

function detectWeb(doc, url) {
	if (/\/\d+\/[a-z\d]+/i.test(url)) {
		return 'forumPost';
	}
	else if (getSearchResults(doc, true)) {
		return 'multiple';
	}
	return false;
}

function select(field) {
	let pages = [
		// https://weibo.com/
		// https://weibo.com/7467277921/NBaFziUqv?refer_flag=1001030103_
		{
			row: 'article.woo-panel-main',
			name: 'a[class*="head_name"]',
			time: 'a[class*="head-info_time"]',
			detail: 'div[class*="detail_text"]',
			button: '[class*="toolbar_main"] > [class*="toolbar_item"]'
		},
		// https://s.weibo.com/weibo?q=%E5%A4%A9%E6%B0%94
		{
			row: '[action-type="feed_list_item"]',
			name: 'a.name',
			time: '.from > a',
			detail: '[node-type*=feed_list_content]',
			button: '.card-act li'
		}
	];
	return pages.map(page => page[field]).join(',');
}

function getSearchResults(doc, checkOnly) {
	var items = {};
	var found = false;
	var rows = doc.querySelectorAll(select('row'));
	for (let row of rows) {
		let href = attr(row, select('time'), 'href');
		let title = `${text(row, select('name'))}：${text(row, select('detail')).substring(0, 30)}……`;
		if (!href || !title) continue;
		if (checkOnly) return true;
		found = true;
		items[href] = title;
	}
	return found ? items : false;
}

async function doWeb(doc, url) {
	if (detectWeb(doc, url) == 'multiple') {
		let rows = Array.from(doc.querySelectorAll(select('row')));
		let items = await Zotero.selectItems(getSearchResults(doc, false));
		if (!items) return;
		for (let url of Object.keys(items)) {
			let row = rows.find(row => row.querySelector(`a[href="${url}"]`));
			let href = row.querySelector(select('time')).href;
			await scrape(row, href);
		}
	}
	else {
		await scrape(doc, url);
	}
}

async function scrape(doc, url = doc.location.href) {
	var newItem = new Z.Item('forumPost');
	let expand = doc.querySelector('.expand');
	if (expand && expand.textContent.includes('展开')) {
		await expand.click();
		let startTime = Date.now();
		// .expand展开后会变为.collapse
		while (expand && Date.now() - startTime < 5000) {
			expand = doc.querySelector('.expand');
			await new Promise(resolve => setTimeout(resolve, 200));
		}
	}
	let detail = text(doc, select('detail'), 1) || text(doc, select('detail'), 0);
	detail = detail.replace(/\s*收起.?$/, '');
	newItem.title = tryMatch(detail, /【(.+?)】/, 1).replace(/#/g, '')
		|| tryMatch(detail, /#(.+?)#/, 1)
		|| `${text(doc, select('name'))}的微博`;
	newItem.abstractNote = detail;
	newItem.forumTitle = '新浪微博';
	let time = text(doc, select('time'));
	let today = new Date();
	Z.debug(time);
	if (/(今天|小时|分钟)/.test(time)) {
		newItem.date = ZU.strToISO(today.toLocaleDateString());
	}
	else if (time.includes('昨天')) {
		let yesterday = new Date();
		yesterday.setDate(today.getDate() - 1);
		newItem.date = ZU.strToISO(`${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`);
	}
	// x月x日
	// x-x  xx:xx
	else if (/^\d{2}\D\d{1,2}\D\d{1,2}/.test(time)) {
		newItem.date = ZU.strToISO(`${today.getFullYear().toString().substring(0, 2)}${time.replace(/\b(\d)\b/g, '0$1')}`);
	}
	else {
		newItem.date = ZU.strToISO(time);
	}
	newItem.url = tryMatch(url, /^.+?\/\d+\/[a-z\d]+/i) || url;
	newItem.language = 'zh-CN';
	// .card-act li见于关键词搜索
	// https://s.weibo.com/weibo?q=%E5%A4%A9%E6%B0%94
	extra.add('reship', text(select('button'), 0));
	extra.add('comment', text(select('button'), 1));
	extra.add('like', text(select('button'), 2));
	extra.add('Status', text(doc, '[class*="head-info_edit"]'), true);
	newItem.creators.push({
		firstName: '',
		lastName: text(doc, select('name')),
		creatorType: 'author',
		fieldMode: 1
	});
	newItem.attachments.push({
		title: 'Snapshot',
		document: doc
	});
	newItem.extra = extra.toString();
	newItem.complete();
}

/**
 * Attempts to get the part of the pattern described from the character,
 * and returns an empty string if not match.
 * @param {String} string
 * @param {RegExp} pattern
 * @param {Number} index
 * @returns
 */
function tryMatch(string, pattern, index = 0) {
	if (!string) return '';
	let match = string.match(pattern);
	return (match && match[index])
		? match[index]
		: '';
}

const extra = {
	clsFields: [],
	elseFields: [],
	add: function (key, value, cls = false) {
		if (value && cls) {
			this.clsFields.push([key, value]);
		}
		else if (value) {
			this.elseFields.push([key, value]);
		}
	},
	toString: function (original) {
		return original
			? [
				...this.clsFields.map(entry => `${entry[0]}: ${entry[1]}`),
				original.replace(/^\n|\n$/g, ''),
				...this.elseFields.map(entry => `${entry[0]}: ${entry[1]}`)
			].join('\n')
			: [...this.clsFields, ...this.elseFields]
				.map(entry => `${entry[0]}: ${entry[1]}`)
				.join('\n');
	}
};

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://weibo.com/newlogin?tabtype=weibo&gid=102803&openLoginLayer=0&url=https%3A%2F%2Fweibo.com%2F",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "https://s.weibo.com/weibo?q=%E5%A4%A9%E6%B0%94",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "https://weibo.com/1871802012",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "https://weibo.com/7467277921/NBaFziUqv?refer_flag=1001030103_",
		"items": [
			{
				"itemType": "forumPost",
				"title": "大金砖来尔滨啦！迪拜小哥从沙漠来感受尔滨冬天",
				"creators": [
					{
						"firstName": "",
						"lastName": "西部决策",
						"creatorType": "author",
						"fieldMode": 1
					}
				],
				"date": "2024-01-10",
				"abstractNote": "【大金砖来尔滨啦！#迪拜小哥从沙漠来感受尔滨冬天# 】#全球媒体争相报道尔滨盛况# #尔滨大火引来迪拜大金砖# 1月9日，黑龙江哈尔滨。为感受哈尔滨的冬天，迪拜小哥特意从沙漠来到魅力四射的哈尔滨并手动点赞表示尔滨很棒。网友纷纷表示，尔滨欢迎国际友人！@西部决策 西部决策的微博视频 ​​​",
				"extra": "Status: 已编辑\nreship: 85\ncomment: 194\nlike: 5481",
				"forumTitle": "新浪微博",
				"language": "zh-CN",
				"url": "https://weibo.com/7467277921/NBaFziUqv",
				"attachments": [
					{
						"title": "Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
