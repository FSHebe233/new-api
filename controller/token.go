package controller

import (
    "net/http"
    "one-api/common"
    "one-api/model"
    "strconv"
    "strings"

    "github.com/gin-gonic/gin"
)

type TokenDTO struct {
    model.Token
    ExpiredState        string `json:"expired_state"`
    DisplayExpiredTime  int64  `json:"display_expired_time"`
    DurationDays        int    `json:"duration_days"`
    DurationHours       int    `json:"duration_hours"`
    IsStarted           bool   `json:"is_started"`
    IsNeverExpire       bool   `json:"is_never_expire"`
    RemainingSeconds    int64  `json:"remaining_seconds"`
    PlanDurationSeconds int64  `json:"plan_duration_seconds"`
    DailyWindowStart    int64  `json:"daily_window_start"`
    DailyResetAt        int64  `json:"daily_reset_at"`
    DailyUsedQuota      int    `json:"daily_used_quota"`
    DailyRemainQuota    int    `json:"daily_remain_quota"`
}

func buildTokenDTO(t *model.Token) TokenDTO {
    dto := TokenDTO{Token: *t}
    // duration breakdown
    if t.DurationSeconds > 0 {
        dto.DurationDays = int(t.DurationSeconds / 86400)
        dto.DurationHours = int((t.DurationSeconds % 86400) / 3600)
    }
    now := common.GetTimestamp()
    // expired state & display time
    if t.StartOnFirstUse && t.FirstUsedTime == 0 {
        dto.ExpiredState = "not_started"
        dto.DisplayExpiredTime = 0
        dto.IsStarted = false
        dto.IsNeverExpire = false
        dto.RemainingSeconds = 0
    } else if t.ExpiredTime == -1 {
        dto.ExpiredState = "never"
        dto.DisplayExpiredTime = -1
        dto.IsStarted = true
        dto.IsNeverExpire = true
        dto.RemainingSeconds = -1
    } else {
        dto.ExpiredState = "timed"
        dto.DisplayExpiredTime = t.ExpiredTime
        dto.IsStarted = true
        dto.IsNeverExpire = false
        if t.ExpiredTime > 0 {
            rem := t.ExpiredTime - now
            if rem < 0 {
                rem = 0
            }
            dto.RemainingSeconds = rem
        }
    }
    dto.PlanDurationSeconds = t.DurationSeconds
    // daily window display
    if t.DailyQuotaLimit > 0 {
        start := t.DayWindowStart
        if start == 0 && t.FirstUsedTime > 0 {
            start = t.FirstUsedTime
        }
        dto.DailyWindowStart = start
        if start > 0 {
            dto.DailyResetAt = start + 86400
        }
        used := t.DayUsedQuota
        if used < 0 {
            used = 0
        }
        if used > t.DailyQuotaLimit {
            used = t.DailyQuotaLimit
        }
        dto.DailyUsedQuota = used
        dto.DailyRemainQuota = t.DailyQuotaLimit - used
    }
    return dto
}
func GetAllTokens(c *gin.Context) {
    userId := c.GetInt("id")
    pageInfo := common.GetPageQuery(c)
    tokens, err := model.GetAllUserTokens(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
    if err != nil {
        common.ApiError(c, err)
        return
    }
    total, _ := model.CountUserTokens(userId)
    // decorate with computed fields
    dtos := make([]TokenDTO, 0, len(tokens))
    for _, t := range tokens {
        dtos = append(dtos, buildTokenDTO(t))
    }
    pageInfo.SetTotal(int(total))
    pageInfo.SetItems(dtos)
    common.ApiSuccess(c, pageInfo)
    return
}

func SearchTokens(c *gin.Context) {
    userId := c.GetInt("id")
    keyword := c.Query("keyword")
    token := c.Query("token")
    tokens, err := model.SearchUserTokens(userId, keyword, token)
    if err != nil {
        common.ApiError(c, err)
        return
    }
    dtos := make([]TokenDTO, 0, len(tokens))
    for _, t := range tokens {
        dtos = append(dtos, buildTokenDTO(t))
    }
    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "message": "",
        "data":    dtos,
    })
    return
}

func GetToken(c *gin.Context) {
    id, err := strconv.Atoi(c.Param("id"))
    userId := c.GetInt("id")
    if err != nil {
        common.ApiError(c, err)
        return
    }
    token, err := model.GetTokenByIds(id, userId)
    if err != nil {
        common.ApiError(c, err)
        return
    }
    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "message": "",
        "data":    buildTokenDTO(token),
    })
    return
}

func GetTokenStatus(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	userId := c.GetInt("id")
	token, err := model.GetTokenByIds(tokenId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}
	c.JSON(http.StatusOK, gin.H{
		"object":          "credit_summary",
		"total_granted":   token.RemainQuota,
		"total_used":      0, // not supported currently
		"total_available": token.RemainQuota,
		"expires_at":      expiredAt * 1000,
	})
}

func GetTokenUsage(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "No Authorization header",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Invalid Bearer token",
		})
		return
	}
	tokenKey := parts[1]

	token, err := model.GetTokenByKey(strings.TrimPrefix(tokenKey, "sk-"), false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    true,
		"message": "ok",
		"data": gin.H{
			"object":               "token_usage",
			"name":                 token.Name,
			"total_granted":        token.RemainQuota + token.UsedQuota,
			"total_used":           token.UsedQuota,
			"total_available":      token.RemainQuota,
			"unlimited_quota":      token.UnlimitedQuota,
			"model_limits":         token.GetModelLimitsMap(),
			"model_limits_enabled": token.ModelLimitsEnabled,
			"expires_at":           expiredAt,
		},
	})
}

func AddToken(c *gin.Context) {
    token := model.Token{}
    err := c.ShouldBindJSON(&token)
    if err != nil {
        common.ApiError(c, err)
        return
    }
	if len(token.Name) > 30 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "浠ょ墝鍚嶇О杩囬暱",
		})
		return
	}
	key, err := common.GenerateKey()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "鐢熸垚浠ょ墝澶辫触",
		})
		common.SysLog("failed to generate token key: " + err.Error())
		return
	}
    cleanToken := model.Token{
        UserId:             c.GetInt("id"),
        Name:               token.Name,
        Key:                key,
        CreatedTime:        common.GetTimestamp(),
        AccessedTime:       common.GetTimestamp(),
        ExpiredTime:        token.ExpiredTime,
        RemainQuota:        token.RemainQuota,
        UnlimitedQuota:     token.UnlimitedQuota,
        ModelLimitsEnabled: token.ModelLimitsEnabled,
        ModelLimits:        token.ModelLimits,
        AllowIps:           token.AllowIps,
        Group:              token.Group,
        StartOnFirstUse:    token.StartOnFirstUse,
        DurationSeconds:    token.DurationSeconds,
        DailyQuotaLimit:    token.DailyQuotaLimit,
    }
    err = cleanToken.Insert()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteToken(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	err := model.DeleteTokenById(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func UpdateToken(c *gin.Context) {
	userId := c.GetInt("id")
	statusOnly := c.Query("status_only")
	token := model.Token{}
	err := c.ShouldBindJSON(&token)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(token.Name) > 30 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "浠ょ墝鍚嶇О杩囬暱",
		})
		return
	}
	cleanToken, err := model.GetTokenByIds(token.Id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if token.Status == common.TokenStatusEnabled {
		if cleanToken.Status == common.TokenStatusExpired && cleanToken.ExpiredTime <= common.GetTimestamp() && cleanToken.ExpiredTime != -1 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "浠ょ墝宸茶繃鏈燂紝鏃犳硶鍚敤锛岃鍏堜慨鏀逛护鐗岃繃鏈熸椂闂达紝鎴栬€呰缃负姘镐笉杩囨湡",
			})
			return
		}
		if cleanToken.Status == common.TokenStatusExhausted && cleanToken.RemainQuota <= 0 && !cleanToken.UnlimitedQuota {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "浠ょ墝鍙敤棰濆害宸茬敤灏斤紝鏃犳硶鍚敤锛岃鍏堜慨鏀逛护鐗屽墿浣欓搴︼紝鎴栬€呰缃负鏃犻檺棰濆害",
			})
			return
		}
	}
    if statusOnly != "" {
        cleanToken.Status = token.Status
    } else {
        // If you add more fields, please also update token.Update()
        cleanToken.Name = token.Name
        // Start-on-first-use expiration guard
        if token.StartOnFirstUse {
            if cleanToken.FirstUsedTime == 0 {
                // 鏈娇鐢紝鍏佽 -1锛堝欢鍚庤嚦棣栫敤鍐嶈绠楋級
                cleanToken.ExpiredTime = token.ExpiredTime
            } else {
                // 已使用：若传入 -1 且有有效持续时长，则根据首用时间+持续时长计算，否则沿用传入值
                if token.ExpiredTime == -1 && token.DurationSeconds > 0 {
                    cleanToken.ExpiredTime = cleanToken.FirstUsedTime + token.DurationSeconds
                } else {
                    cleanToken.ExpiredTime = token.ExpiredTime
                }
            }
        } else {
            cleanToken.ExpiredTime = token.ExpiredTime
        }
        cleanToken.RemainQuota = token.RemainQuota
        cleanToken.UnlimitedQuota = token.UnlimitedQuota
        cleanToken.ModelLimitsEnabled = token.ModelLimitsEnabled
        cleanToken.ModelLimits = token.ModelLimits
        cleanToken.AllowIps = token.AllowIps
        cleanToken.Group = token.Group
        cleanToken.StartOnFirstUse = token.StartOnFirstUse
        cleanToken.DurationSeconds = token.DurationSeconds
        cleanToken.DailyQuotaLimit = token.DailyQuotaLimit
    }
    err = cleanToken.Update()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
    	"data":    buildTokenDTO(cleanToken),
    })
	return
}

type TokenBatch struct {
	Ids []int `json:"ids"`
}

func DeleteTokenBatch(c *gin.Context) {
	tokenBatch := TokenBatch{}
	if err := c.ShouldBindJSON(&tokenBatch); err != nil || len(tokenBatch.Ids) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "鍙傛暟閿欒",
		})
		return
	}
	userId := c.GetInt("id")
	count, err := model.BatchDeleteTokens(tokenBatch.Ids, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}






