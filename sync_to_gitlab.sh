NEW_FILE_CODE
#!/bin/bash

# 脚本名称: sync_to_gitlab.sh
# 功能: 增量同步 GitHub 的变更到 GitLab（只推送有变化的分支）

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 初始化计数器
PUSHED=0
FAILED=0

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  GitHub → GitLab 增量同步工具${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. 检查是否已添加 origin remote
if ! git remote | grep -q "origin"; then
    echo -e "${YELLOW}警告: origin remote 不存在，请先添加 GitLab remote${NC}"
    exit 1
else
    echo -e "${GREEN}✓ origin remote 已存在${NC}"
fi

echo ""

# 2. 更新远程信息
echo -e "${BLUE}步骤 1: 从 github 拉取最新数据...${NC}"
git fetch github --prune > /dev/null 2>&1 || true
echo -e "${GREEN}✓ 拉取完成${NC}"
echo ""

# 3. 检测有变化的分支
echo -e "${BLUE}步骤 2: 检测有变化的分支...${NC}"

CHANGED_BRANCHES=()
NEW_BRANCHES=()
UNCHANGED_COUNT=0

# 遍历所有本地分支
while IFS= read -r branch; do
    # 清理分支名（去除前导空格和 *）
    branch=$(echo "$branch" | sed 's/^[* ]*//')
    
    if [ -z "$branch" ]; then
        continue
    fi
    
    # 检查 origin 上是否存在该分支
    if git ls-remote --heads origin "$branch" | grep -q "$branch"; then
        # 分支已存在，检查是否有变化
        LOCAL_COMMIT=$(git rev-parse "$branch" 2>/dev/null)
        REMOTE_COMMIT=$(git ls-remote --heads origin "$branch" | awk '{print $1}')
        
        if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
            CHANGED_BRANCHES+=("$branch")
            echo -e "  ${YELLOW}↻${NC} $branch (有更新)"
        else
            UNCHANGED_COUNT=$((UNCHANGED_COUNT + 1))
        fi
    else
        # 分支不存在，是新分支
        NEW_BRANCHES+=("$branch")
        echo -e "  ${GREEN}+${NC} $branch (新分支)"
    fi
done < <(git branch | grep -v '\->')

TOTAL_CHANGED=${#CHANGED_BRANCHES[@]}
TOTAL_NEW=${#NEW_BRANCHES[@]}
TOTAL_TO_PUSH=$((TOTAL_CHANGED + TOTAL_NEW))

echo ""
echo -e "${BLUE}检测结果:${NC}"
echo -e "  ${GREEN}新分支:${NC} $TOTAL_NEW"
echo -e "  ${YELLOW}有更新的分支:${NC} $TOTAL_CHANGED"
echo -e "  ${CYAN}无变化的分支:${NC} $UNCHANGED_COUNT"
echo -e "  ${BLUE}需要推送的总数:${NC} $TOTAL_TO_PUSH"
echo ""

if [ $TOTAL_TO_PUSH -eq 0 ]; then
    echo -e "${GREEN}✓ 所有分支都是最新的，无需推送${NC}"
    NEED_PUSH_BRANCHES=false
else
    NEED_PUSH_BRANCHES=true
fi

# 4. 确认推送分支
if [ "$NEED_PUSH_BRANCHES" = true ]; then
    read -p "$(echo -e ${YELLOW}是否推送这 $TOTAL_TO_PUSH 个分支到 GitLab (origin)? (y/n): ${NC})" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PUSH_BRANCHES=true
    else
        PUSH_BRANCHES=false
        echo -e "${YELLOW}⚠ 跳过分支推送${NC}"
    fi
else
    PUSH_BRANCHES=false
fi

echo ""

# 5. 推送有变化的分支
if [ "$PUSH_BRANCHES" = true ]; then
    echo -e "${BLUE}步骤 3: 推送有变化的分支...${NC}"
    START_TIME=$(date +%s)
    
    PUSHED=0
    FAILED=0
    
    # 推送新分支
    for branch in "${NEW_BRANCHES[@]}"; do
        echo -e "  推送新分支: $branch"
        if git push origin "$branch" > /dev/null 2>&1; then
            PUSHED=$((PUSHED + 1))
        else
            echo -e "  ${RED}✗ 失败: $branch${NC}"
            FAILED=$((FAILED + 1))
        fi
    done
    
    # 推送有更新的分支
    for branch in "${CHANGED_BRANCHES[@]}"; do
        echo -e "  推送更新: $branch"
        if git push origin "$branch" > /dev/null 2>&1; then
            PUSHED=$((PUSHED + 1))
        else
            echo -e "  ${RED}✗ 失败: $branch${NC}"
            FAILED=$((FAILED + 1))
        fi
    done
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    echo ""
    echo -e "${GREEN}✓ 分支推送完成 (成功: $PUSHED, 失败: $FAILED, 耗时: ${DURATION}秒)${NC}"
    echo ""
fi

# 6. 检测新标签（可选）
echo -e "${BLUE}步骤 4: 检测新标签...${NC}"

NEW_TAGS=()
EXISTING_TAGS_ON_ORIGIN=$(git ls-remote --tags origin | awk '{print $2}' | sed 's/refs\/tags\///' | sort)

for tag in $(git tag); do
    if ! echo "$EXISTING_TAGS_ON_ORIGIN" | grep -q "^${tag}$"; then
        NEW_TAGS+=("$tag")
    fi
done

TOTAL_NEW_TAGS=${#NEW_TAGS[@]}

if [ $TOTAL_NEW_TAGS -gt 0 ]; then
    echo -e "  ${YELLOW}发现 $TOTAL_NEW_TAGS 个新标签:${NC}"
    for tag in "${NEW_TAGS[@]}"; do
        echo -e "    - $tag"
    done
    echo ""
    
    read -p "$(echo -e ${YELLOW}是否推送这些新标签到 GitLab (origin)? (y/n): ${NC})" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}正在推送标签...${NC}"
        if git push origin --tags; then
            echo -e "${GREEN}✓ 标签推送成功${NC}"
        else
            echo -e "${RED}✗ 标签推送失败${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ 跳过标签推送${NC}"
    fi
else
    echo -e "${GREEN}✓ 没有新标签需要推送${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ 同步完成！${NC}"
echo -e "${GREEN}========================================${NC}"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}⚠ 有 $FAILED 个分支推送失败，请检查错误信息${NC}"
    exit 1
fi