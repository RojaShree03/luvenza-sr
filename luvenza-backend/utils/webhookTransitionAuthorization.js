const authorizedQueries = new WeakMap();

const authorizeWebhookQuery = (query, operation) => {
    if (!['claim', 'complete', 'fail'].includes(operation)) {
        throw new TypeError('A valid webhook processing operation is required');
    }
    authorizedQueries.set(query, operation);
    return query;
};

const getAuthorizedWebhookOperation = query => authorizedQueries.get(query);

module.exports = { authorizeWebhookQuery, getAuthorizedWebhookOperation };
