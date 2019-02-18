import Config from 'config'
import path from 'path'
import Telegraf from 'telegraf'
import TelegrafI18n from 'telegraf-i18n'
import TelegrafSession from 'telegraf/session'
import { Riksdb } from './dictionary'
import { getCodePoint, GlyphRenderer } from './util'

const bot = new Telegraf(Config.get('Bot.token'))
const i18n = new TelegrafI18n({
    defaultLanguage: 'en',
    allowMissing: true,
    directory: path.resolve(__dirname, '../locales'),
    useSession: true,
})
const userLang = {}

const answerTimeout = Config.get('Bot.answerTimeout')
bot.use(TelegrafSession())
bot.use(i18n.middleware())
bot.use(async (_, next) => {
    const start = new Date()
    await next()
    const ms = new Date() - start
})
bot.use((ctx, next) => {
    if (!answerTimeout || !ctx.message) {
        return next()
    } else {
        const delay = Date.now() / 1000 - ctx.message.date
        if (delay <= answerTimeout) {
            return next()
        }
    }
})
bot.use((ctx, next) => {
    ctx.lang = userLang[ctx.from.id] || ctx.from.language_code
    return next()
})

const riksdb = new Riksdb()
function buildDictionary(letter) {
    return Telegraf.Extra
        .markdown()
        .markup((m) => m.inlineKeyboard([
            m.callbackButton('Riksdb', 'riks_' + letter)
        ]))
}
bot.hears(/^(?:何字|무슨한자|what(?:hanzi|hanja|kanji))\s+(.)$/, (ctx) => {
    const character = ctx.match[1]
    return ctx.reply(i18n.t(ctx.lang, 'search.select-dic'), buildDictionary(character))
})

const localeMenu = Telegraf.Extra
    .markdown()
    .markup((m) => m.inlineKeyboard([
        m.callbackButton('🇨🇳', 'lang_cn'),
        m.callbackButton('🇭🇰', 'lang_hk'),
        m.callbackButton('🇯🇵', 'lang_jp'),
        m.callbackButton('🇰🇷', 'lang_kr'),
        m.callbackButton('🇹🇼', 'lang_tw'),
        m.callbackButton('🇺🇸', 'lang_en'),
    ]))
bot.command('lang', (ctx) => {
    return ctx.reply(i18n.t(ctx.lang, 'lang.ask'), localeMenu)
})

bot.action(/^lang_(..)$/, (ctx) => {
    const { from, match } = ctx
    let lang = 'en'
    switch (match[1]) {
        case 'cn':
            lang = 'zh_CN'
            break;
        case 'hk':
            lang = 'zh_HK'
            break;
        case 'jp':
            lang = 'ja_JP'
            break;
        case 'kr':
            lang = 'ko_KR'
            break;
        case 'tw':
            lang = 'zh_TW'
            break;
    }
    userLang[from.id] = lang
    return ctx.editMessageText(i18n.t(lang, 'lang.changed', { lang }))
})

const glyphRenderer = new GlyphRenderer()
bot.action(/^riks_(.)$/, async (ctx) => {
    const { match, lang } = ctx
    const character = getCodePoint(match[1])
    console.log(`Request U+${character.toString(16).toUpperCase().padStart(4, '0')}, Locale ${lang}`)
    try {
        const result = await riksdb.findByUnicode(character)
        if (result) {
            await ctx.deleteMessage()
            const [rendered, message] = await Promise.all([glyphRenderer.render(match[1]), ctx.replyWithPhoto('https://i.ibb.co/9TCF0WZ/loading.png', {
                caption: i18n.t(lang, 'search.riksdb', result),
            })])
            return ctx.telegram.editMessageMedia(ctx.chat.id, message.message_id, null, {
                type: 'photo',
                media: {
                    source: rendered,
                },
                caption: i18n.t(lang, 'search.riksdb', result),
            })
        } else {
            return ctx.editMessageText(i18n.t(lang, 'search.no-result'))
        }
    } catch (err) {
        return ctx.editMessageText(i18n.t(lang, 'error', { err }), Telegraf.Extra.HTML())
    }
})

bot.catch(err => {
    console.error(err)
})

bot.launch()