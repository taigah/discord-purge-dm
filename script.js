{
  /**
   * localStorage is removed from window therefore we create an iframe
   * thus retrieving a new untampered window object with the same context
   * and as such we can get access to the localStorage object
   */
  function localStorageGetItem (key) {
    // we cache the iframe
    if (globalThis.localStorageIframe === undefined) {
      globalThis.localStorageIframe = document.createElement('iframe')
      document.body.appendChild(globalThis.localStorageIframe)
    }
    return globalThis.localStorageIframe.contentWindow.localStorage.getItem(key)
  }

  function getAuthToken () {
    const rawAuthToken = localStorageGetItem("token")
    return JSON.parse(rawAuthToken)
  }

  function getUserId () {
    return JSON.parse(localStorageGetItem("user_id_cache"))
  }

  function getChannelId (url) {
    return url.split("/")[5]
  }

  const authToken = getAuthToken()
  const authorId = getUserId()

  const COOLDOWN = 1000

  const baseURL = "https://discord.com/api/"
  const channelId = getChannelId(window.location.href)
  const defaultHeaders = { Authorization: authToken }

  function sleep (duration) {
    return new Promise(res => setTimeout(res, duration))
  }

  async function fetchRetry(...args) {
    const res = await fetch(...args)
    if (!res.ok) {
      console.error(`HTTP ERROR ${res.status}: ${res.url}`)
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after"), 10) * 1000
        await sleep(retryAfter)
      }
      return fetchRetry(...args)
    }
    return res
  }

  async function getMessages(channelId, lastMessageId) {
    const url = new URL(
        `channels/${channelId}/messages?before=${lastMessageId}&limit=100`,
        baseURL
      ).href
    const res = await fetchRetry(url, { headers: defaultHeaders })
    const messages = await res.json()
    await sleep(COOLDOWN)
    return messages.map(message => ({
      id: message.id,
      authorId: message.author.id
    }))
  }

  function filterMessageListByAuthor(messageList, authorId) {
    return messageList.filter(m => m.authorId === authorId)
  }

  async function deleteMessage(messageId) {
    const url = new URL(`channels/${channelId}/messages/${messageId}`, baseURL).href
    await fetchRetry(url, {
      method: 'DELETE',
      headers: defaultHeaders
    })
    await sleep(COOLDOWN)
  }

  async function deleteMessages(messages) {
    for (const message of messages) {
      await deleteMessage(message.id)
    }
  }

  function promptMessageId() {
    const messageId = parseInt(prompt("From which message id?"), 10)
    if (isNaN(messageId)) {
      return null
    }
    return messageId
  }

  async function run () {
    try {
      // TODO: move this in popup.js
      let lastMessageId = promptMessageId()
      if (lastMessageId === null) {
        return
      }
      while (window.stop_script !== true) {
        const messages = await getMessages(channelId, lastMessageId)
        if (messages.length === 0) {
          console.log("finished")
          break
        }
        lastMessageId = messages.at(-1).id
        const ownMessages = filterMessageListByAuthor(messages, authorId)
        await deleteMessages(ownMessages)
      }
    } catch (err) {
      console.error(err)
    }
  }

  run()
}
