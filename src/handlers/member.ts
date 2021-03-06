import { endpoints } from "../constants/discord.ts";
import { cacheHandlers } from "../controllers/cache.ts";
import { botID } from "../module/client.ts";
import { RequestManager } from "../module/requestManager.ts";
import type { Member } from "../structures/member.ts";
import { structures } from "../structures/mod.ts";
import type { ImageFormats, ImageSize } from "../types/cdn.ts";
import type {
  DMChannelCreatePayload,
  MessageContent,
} from "../types/channel.ts";
import { Errors } from "../types/errors.ts";
import type { EditMemberOptions } from "../types/member.ts";
import { Permissions } from "../types/permission.ts";
import { formatImageURL } from "../utils/cdn.ts";
import {
  botHasPermission,
  higherRolePosition,
  highestRole,
} from "../utils/permissions.ts";
import { sendMessage } from "./channel.ts";

/** The users custom avatar or the default avatar if you don't have a member object. */
export function rawAvatarURL(
  userID: string,
  discriminator: string,
  avatar?: string | null,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return avatar
    ? formatImageURL(endpoints.USER_AVATAR(userID, avatar), size, format)
    : endpoints.USER_DEFAULT_AVATAR(Number(discriminator) % 5);
}

/** The users custom avatar or the default avatar */
export function avatarURL(
  member: Member,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return rawAvatarURL(
    member.user.id,
    member.user.discriminator,
    member.user.avatar,
    size,
    format,
  );
}

/** Add a role to the member */
export async function addRole(
  guildID: string,
  memberID: string,
  roleID: string,
  reason?: string,
) {
  const botsHighestRole = await highestRole(guildID, botID);
  if (
    botsHighestRole &&
    !higherRolePosition(guildID, botsHighestRole.id, roleID)
  ) {
    throw new Error(Errors.BOTS_HIGHEST_ROLE_TOO_LOW);
  }

  if (!botHasPermission(guildID, [Permissions.MANAGE_ROLES])) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }

  return RequestManager.put(
    endpoints.GUILD_MEMBER_ROLE(guildID, memberID, roleID),
    { reason },
  );
}

/** Remove a role from the member */
export async function removeRole(
  guildID: string,
  memberID: string,
  roleID: string,
  reason?: string,
) {
  const botsHighestRole = await highestRole(guildID, botID);
  if (
    botsHighestRole &&
    !higherRolePosition(guildID, botsHighestRole.id, roleID)
  ) {
    throw new Error(Errors.BOTS_HIGHEST_ROLE_TOO_LOW);
  }

  if (!botHasPermission(guildID, [Permissions.MANAGE_ROLES])) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }
  return RequestManager.delete(
    endpoints.GUILD_MEMBER_ROLE(guildID, memberID, roleID),
    { reason },
  );
}

/** Send a message to a users DM. Note: this takes 2 API calls. 1 is to fetch the users dm channel. 2 is to send a message to that channel. */
export async function sendDirectMessage(
  memberID: string,
  content: string | MessageContent,
) {
  let dmChannel = await cacheHandlers.get("channels", memberID);
  if (!dmChannel) {
    // If not available in cache create a new one.
    const dmChannelData = await RequestManager.post(
      endpoints.USER_CREATE_DM,
      { recipient_id: memberID },
    ) as DMChannelCreatePayload;
    // Channel create event will have added this channel to the cache
    cacheHandlers.delete("channels", dmChannelData.id);
    const channel = await structures.createChannel(dmChannelData);
    // Recreate the channel and add it undert he users id
    cacheHandlers.set("channels", memberID, channel);
    dmChannel = channel;
  }

  // If it does exist try sending a message to this user
  return sendMessage(dmChannel.id, content);
}

/** Kick a member from the server */
export async function kick(guildID: string, memberID: string, reason?: string) {
  const botsHighestRole = await highestRole(guildID, botID);
  const membersHighestRole = await highestRole(guildID, memberID);
  if (
    botsHighestRole && membersHighestRole &&
    botsHighestRole.position <= membersHighestRole.position
  ) {
    throw new Error(Errors.BOTS_HIGHEST_ROLE_TOO_LOW);
  }

  if (!botHasPermission(guildID, [Permissions.KICK_MEMBERS])) {
    throw new Error(Errors.MISSING_KICK_MEMBERS);
  }
  return RequestManager.delete(
    endpoints.GUILD_MEMBER(guildID, memberID),
    { reason },
  );
}

/** Edit the member */
export function editMember(
  guildID: string,
  memberID: string,
  options: EditMemberOptions,
) {
  if (options.nick) {
    if (options.nick.length > 32) {
      throw new Error(Errors.NICKNAMES_MAX_LENGTH);
    }
    if (!botHasPermission(guildID, [Permissions.MANAGE_NICKNAMES])) {
      throw new Error(Errors.MISSING_MANAGE_NICKNAMES);
    }
  }

  if (
    options.roles &&
    !botHasPermission(guildID, [Permissions.MANAGE_ROLES])
  ) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }

  if (options.mute) {
    // TODO: This should check if the member is in a voice channel
    if (
      !botHasPermission(guildID, [Permissions.MUTE_MEMBERS])
    ) {
      throw new Error(Errors.MISSING_MUTE_MEMBERS);
    }
  }

  if (
    options.deaf &&
    !botHasPermission(guildID, [Permissions.DEAFEN_MEMBERS])
  ) {
    throw new Error(Errors.MISSING_DEAFEN_MEMBERS);
  }

  // TODO: if channel id is provided check if the bot has CONNECT and MOVE in channel and current channel

  return RequestManager.patch(
    endpoints.GUILD_MEMBER(guildID, memberID),
    options,
  );
}
