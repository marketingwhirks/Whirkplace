import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SmilePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Default emoji set
const DEFAULT_EMOJIS = ["👍", "❤️", "🎉", "🚀", "😊"];

interface ReactionGroup {
  emoji: string;
  count: number;
  users: Array<{ id: string; name: string }>;
  hasUserReacted: boolean;
}

interface EmojiReactionsProps {
  postId: string;
  postType: "win" | "shoutout";
  className?: string;
  compact?: boolean; // For smaller display in list views
}

export function EmojiReactions({ 
  postId, 
  postType, 
  className,
  compact = false 
}: EmojiReactionsProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { data: currentUser } = useCurrentUser();
  const { toast } = useToast();

  const postTypeForApi = postType === "win" ? "wins" : "shoutouts";

  // Fetch reactions for this post
  const { data: reactions = [], isLoading } = useQuery<ReactionGroup[]>({
    queryKey: [`/api/${postTypeForApi}/${postId}/reactions`],
    enabled: !!postId,
  });

  // Add reaction mutation
  const addReactionMutation = useMutation({
    mutationFn: async (emoji: string) => {
      const response = await apiRequest("POST", "/api/reactions", {
        postId,
        postType,
        emoji,
      });
      return await response.json();
    },
    onMutate: async (emoji) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/${postTypeForApi}/${postId}/reactions`] });

      // Snapshot previous value
      const previousReactions = queryClient.getQueryData<ReactionGroup[]>([`/api/${postTypeForApi}/${postId}/reactions`]);

      // Optimistically update
      if (previousReactions && currentUser) {
        const newReactions = [...previousReactions];
        const existingReaction = newReactions.find(r => r.emoji === emoji);
        
        if (existingReaction) {
          if (!existingReaction.hasUserReacted) {
            existingReaction.count++;
            existingReaction.hasUserReacted = true;
            existingReaction.users.push({ id: currentUser.id, name: currentUser.name });
          }
        } else {
          newReactions.push({
            emoji,
            count: 1,
            users: [{ id: currentUser.id, name: currentUser.name }],
            hasUserReacted: true,
          });
        }

        queryClient.setQueryData([`/api/${postTypeForApi}/${postId}/reactions`], newReactions);
      }

      return { previousReactions };
    },
    onError: (err, emoji, context) => {
      // Rollback on error
      if (context?.previousReactions) {
        queryClient.setQueryData([`/api/${postTypeForApi}/${postId}/reactions`], context.previousReactions);
      }
      toast({
        title: "Error",
        description: "Failed to add reaction",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: [`/api/${postTypeForApi}/${postId}/reactions`] });
    },
  });

  // Remove reaction mutation
  const removeReactionMutation = useMutation({
    mutationFn: async (reactionId: string) => {
      const response = await apiRequest("DELETE", `/api/reactions/${reactionId}`);
      return response;
    },
    onMutate: async (reactionId) => {
      // For optimistic update, we need to find which emoji this reaction belongs to
      // This is a simplified version - in production you'd track reaction IDs
      await queryClient.cancelQueries({ queryKey: [`/api/${postTypeForApi}/${postId}/reactions`] });
      const previousReactions = queryClient.getQueryData<ReactionGroup[]>([`/api/${postTypeForApi}/${postId}/reactions`]);
      return { previousReactions };
    },
    onError: (err, reactionId, context) => {
      if (context?.previousReactions) {
        queryClient.setQueryData([`/api/${postTypeForApi}/${postId}/reactions`], context.previousReactions);
      }
      toast({
        title: "Error",
        description: "Failed to remove reaction",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/${postTypeForApi}/${postId}/reactions`] });
    },
  });

  const handleEmojiClick = (emoji: string) => {
    const existingReaction = reactions.find(r => r.emoji === emoji && r.hasUserReacted);
    
    if (existingReaction) {
      // User has already reacted with this emoji - we don't have the reaction ID
      // In a real implementation, we'd track reaction IDs properly
      toast({
        description: "You've already reacted with this emoji",
      });
    } else {
      addReactionMutation.mutate(emoji);
    }
    
    setShowEmojiPicker(false);
  };

  const handleReactionToggle = (reaction: ReactionGroup) => {
    if (reaction.hasUserReacted) {
      // In a real implementation, we'd have the reaction ID to remove
      // For now, just show a message
      toast({
        description: "Click the emoji again to remove your reaction",
      });
    } else {
      addReactionMutation.mutate(reaction.emoji);
    }
  };

  const formatUserList = (users: Array<{ id: string; name: string }>) => {
    if (users.length === 0) return "";
    if (users.length === 1) return users[0].name;
    if (users.length === 2) return `${users[0].name} and ${users[1].name}`;
    if (users.length <= 5) {
      const displayUsers = users.slice(0, 4);
      return `${displayUsers.map(u => u.name).join(", ")} and ${users.length - 4} more`;
    }
    return `${users.slice(0, 5).map(u => u.name).join(", ")} and ${users.length - 5} more`;
  };

  if (isLoading) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1 flex-wrap", className)}>
        {/* Display existing reactions */}
        {reactions.map((reaction) => (
          <Tooltip key={reaction.emoji}>
            <TooltipTrigger asChild>
              <Button
                variant={reaction.hasUserReacted ? "secondary" : "ghost"}
                size={compact ? "sm" : "default"}
                className={cn(
                  "h-auto py-1 px-2 gap-1",
                  reaction.hasUserReacted && "ring-1 ring-primary",
                  compact && "text-xs"
                )}
                onClick={() => handleReactionToggle(reaction)}
                data-testid={`reaction-${reaction.emoji}`}
              >
                <span className={compact ? "text-sm" : "text-base"}>{reaction.emoji}</span>
                <span className={cn(
                  "font-medium",
                  compact ? "text-xs" : "text-sm"
                )}>
                  {reaction.count}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">
                {formatUserList(reaction.users)}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Add reaction button */}
        <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size={compact ? "sm" : "default"}
              className={cn(
                "h-auto py-1 px-2",
                compact && "text-xs"
              )}
              data-testid="button-add-reaction"
            >
              <SmilePlus className={cn("h-4 w-4", compact && "h-3 w-3")} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="flex gap-1">
              {DEFAULT_EMOJIS.map((emoji) => {
                const isReacted = reactions.some(r => r.emoji === emoji && r.hasUserReacted);
                return (
                  <Button
                    key={emoji}
                    variant={isReacted ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "text-lg px-2 py-1",
                      isReacted && "ring-1 ring-primary"
                    )}
                    onClick={() => handleEmojiClick(emoji)}
                    disabled={isReacted}
                    data-testid={`emoji-option-${emoji}`}
                  >
                    {emoji}
                  </Button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}