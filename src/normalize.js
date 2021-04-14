import { has, isObject } from 'lodash/fp';
import { createRemoteFileNode } from 'gatsby-source-filesystem';

const isImage = has('mime');
const getUpdatedAt = (image) => image.updatedAt || image.updated_at;

const extractImage = async (image, ctx) => {
  const { apiURL, store, cache, createNode, createNodeId, touchNode, auth } = ctx;

  let fileNodeID;

  // using field on the cache key for multiple image field
  const mediaDataCacheKey = `strapi-media-${image.id}`;
  const cacheMediaData = await cache.get(mediaDataCacheKey);

  // If we have cached media data and it wasn't modified, reuse
  // previously created file node to not try to redownload
  if (cacheMediaData && getUpdatedAt(image) === cacheMediaData.updatedAt) {
    fileNodeID = cacheMediaData.fileNodeID;
    touchNode({ nodeId: fileNodeID });
  }

  // If we don't have cached data, download the file
  if (!fileNodeID) {
    // full media url
    const source_url = buildImageUrl(image, apiURL);
    const fileNode = await createRemoteFileNode({
      url: source_url,
      store,
      cache,
      createNode,
      createNodeId,
      auth,
      ext: image.ext,
      name: image.name,
    });

    if (fileNode) {
      fileNodeID = fileNode.id;

      await cache.set(mediaDataCacheKey, {
        fileNodeID,
        updatedAt: getUpdatedAt(image),
      });
    }
  }

  if (fileNodeID) {
    image.localFile___NODE = fileNodeID;
  }
};

const buildImageUrl = (image, apiURL) => {
  const source_url = `${image.url.startsWith('http') ? '' : apiURL}${image.url}`;
  const custom = image['__custom'];
  if (!custom) return source_url;
  let url = source_url.split('/');
  if (custom.width || custom.height) {
    let transform = '';
    if (custom.width) {
      transform += `w_${custom.width},`;
    }
    if (custom.height) {
      transform += `h_${custom.height},`;
    }
    transform += 'c_scale';
    url[6] = transform;
  }
  if (custom.format) {
    url[7] = url[7].substr(0, url[7].lastIndexOf('.')) + '.' + custom.format;
  }
  return url.join('/');
};

const extractFields = async (item, ctx) => {
  if (isImage(item)) {
    return extractImage(item, ctx);
  }

  if (Array.isArray(item)) {
    for (const element of item) {
      await extractFields(element, ctx);
    }

    return;
  }

  if (isObject(item)) {
    for (const key in item) {
      await extractFields(item[key], ctx);
    }

    return;
  }
};

// Downloads media from image type fields
exports.downloadMediaFiles = async (entities, ctx) => {
  return Promise.all(entities.map((entity) => extractFields(entity, ctx)));
};
