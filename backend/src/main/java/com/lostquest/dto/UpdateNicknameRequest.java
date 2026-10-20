package com.lostquest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Same limits as signup; posts and comments show the current nickname, so a change applies everywhere. */
public record UpdateNicknameRequest(@NotBlank @Size(max = 20) String nickname) {}
