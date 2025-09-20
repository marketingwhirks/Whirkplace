// PDF Export Service for Reports and One-on-Ones
import jsPDF from 'jspdf';
import { storage } from '../storage';
import type { Checkin, OneOnOne, User, Organization } from '@shared/schema';

export class PDFExportService {
  
  // Generate PDF report for team check-ins
  static async generateCheckinReport(
    organizationId: string, 
    startDate: Date, 
    endDate: Date,
    teamId?: string
  ): Promise<Buffer> {
    try {
      const organization = await storage.getOrganization(organizationId);
      const checkins = await storage.getCheckinsByDateRange(organizationId, startDate, endDate, teamId);
      const users = await storage.getUsers(organizationId);
      
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.text(`Check-in Report - ${organization?.name || 'Organization'}`, 20, 30);
      
      doc.setFontSize(12);
      doc.text(`Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, 20, 45);
      
      if (teamId) {
        const team = await storage.getTeam(organizationId, teamId);
        doc.text(`Team: ${team?.name || 'Unknown'}`, 20, 55);
      }
      
      let yPosition = 70;
      
      // Summary Statistics
      doc.setFontSize(16);
      doc.text('Summary', 20, yPosition);
      yPosition += 10;
      
      doc.setFontSize(12);
      const averageRating = checkins.reduce((sum, c) => sum + (c.moodRating || 0), 0) / checkins.length || 0;
      doc.text(`Total Check-ins: ${checkins.length}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Average Mood Rating: ${averageRating.toFixed(1)}/5`, 20, yPosition);
      yPosition += 8;
      doc.text(`Participation Rate: ${Math.round((checkins.length / users.length) * 100)}%`, 20, yPosition);
      yPosition += 20;
      
      // Individual Check-ins
      doc.setFontSize(16);
      doc.text('Individual Check-ins', 20, yPosition);
      yPosition += 15;
      
      for (const checkin of checkins.slice(0, 20)) { // Limit to first 20 for space
        const user = users.find(u => u.id === checkin.userId);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${user?.name || 'Unknown User'}`, 20, yPosition);
        doc.setFont(undefined, 'normal');
        yPosition += 8;
        
        doc.text(`Date: ${new Date(checkin.createdAt).toLocaleDateString()}`, 30, yPosition);
        yPosition += 6;
        doc.text(`Mood: ${checkin.moodRating}/5`, 30, yPosition);
        yPosition += 6;
        
        if (checkin.wins && checkin.wins.length > 0) {
          doc.text(`Wins: ${checkin.wins.slice(0, 100)}...`, 30, yPosition);
          yPosition += 6;
        }
        
        if (checkin.challenges && checkin.challenges.length > 0) {
          doc.text(`Challenges: ${checkin.challenges.slice(0, 100)}...`, 30, yPosition);
          yPosition += 6;
        }
        
        yPosition += 8;
        
        // Check if we need a new page
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 30;
        }
      }
      
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('PDF generation error:', error);
      throw new Error('Failed to generate check-in report');
    }
  }
  
  // Generate PDF for one-on-one meeting
  static async generateOneOnOnePDF(organizationId: string, meetingId: string): Promise<Buffer> {
    try {
      const meeting = await storage.getOneOnOne(organizationId, meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }
      
      const [participantOne, participantTwo, organization] = await Promise.all([
        storage.getUser(organizationId, meeting.participantOneId),
        storage.getUser(organizationId, meeting.participantTwoId),
        storage.getOrganization(organizationId)
      ]);
      
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.text(`One-on-One Meeting Summary`, 20, 30);
      
      // Meeting Details
      doc.setFontSize(14);
      doc.text('Meeting Details', 20, 50);
      
      doc.setFontSize(12);
      let yPosition = 65;
      
      doc.text(`Date: ${new Date(meeting.scheduledAt).toLocaleDateString()}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Participants: ${participantOne?.name} & ${participantTwo?.name}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Duration: ${meeting.duration || 30} minutes`, 20, yPosition);
      yPosition += 8;
      doc.text(`Status: ${meeting.status}`, 20, yPosition);
      yPosition += 20;
      
      // Agenda
      if (meeting.agenda) {
        doc.setFontSize(14);
        doc.text('Agenda', 20, yPosition);
        yPosition += 15;
        
        doc.setFontSize(12);
        const agendaLines = doc.splitTextToSize(meeting.agenda, 170);
        agendaLines.forEach((line: string) => {
          doc.text(line, 20, yPosition);
          yPosition += 6;
        });
        yPosition += 15;
      }
      
      // Notes
      if (meeting.notes) {
        doc.setFontSize(14);
        doc.text('Meeting Notes', 20, yPosition);
        yPosition += 15;
        
        doc.setFontSize(12);
        const notesLines = doc.splitTextToSize(meeting.notes, 170);
        notesLines.forEach((line: string) => {
          doc.text(line, 20, yPosition);
          yPosition += 6;
          
          // Check if we need a new page
          if (yPosition > 250) {
            doc.addPage();
            yPosition = 30;
          }
        });
        yPosition += 15;
      }
      
      // Action Items
      if (meeting.actionItems && Array.isArray(meeting.actionItems) && meeting.actionItems.length > 0) {
        doc.setFontSize(14);
        doc.text('Action Items', 20, yPosition);
        yPosition += 15;
        
        doc.setFontSize(12);
        meeting.actionItems.forEach((item: any, index: number) => {
          doc.text(`${index + 1}. ${item.description || item}`, 20, yPosition);
          yPosition += 8;
          
          if (item.assignedTo) {
            const assignedUser = [participantOne, participantTwo].find(u => u?.id === item.assignedTo);
            doc.text(`   Assigned to: ${assignedUser?.name || 'Unknown'}`, 20, yPosition);
            yPosition += 6;
          }
          
          if (item.dueDate) {
            doc.text(`   Due: ${new Date(item.dueDate).toLocaleDateString()}`, 20, yPosition);
            yPosition += 6;
          }
          
          yPosition += 5;
          
          // Check if we need a new page
          if (yPosition > 250) {
            doc.addPage();
            yPosition = 30;
          }
        });
      }
      
      // Footer
      doc.setFontSize(10);
      doc.text(`Generated on ${new Date().toLocaleDateString()} by ${organization?.name || 'Whirkplace'}`, 20, 280);
      
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('One-on-one PDF generation error:', error);
      throw new Error('Failed to generate one-on-one PDF');
    }
  }
  
  // Generate team analytics report
  static async generateAnalyticsReport(organizationId: string, period: 'week' | 'month' | 'quarter'): Promise<Buffer> {
    try {
      const organization = await storage.getOrganization(organizationId);
      const users = await storage.getUsers(organizationId);
      
      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();
      switch (period) {
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
      }
      
      const checkins = await storage.getCheckinsByDateRange(organizationId, startDate, endDate);
      const wins = await storage.getWinsByDateRange(organizationId, startDate, endDate);
      
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.text(`Analytics Report - ${organization?.name || 'Organization'}`, 20, 30);
      
      doc.setFontSize(12);
      doc.text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)} ending ${endDate.toLocaleDateString()}`, 20, 45);
      
      let yPosition = 65;
      
      // Key Metrics
      doc.setFontSize(16);
      doc.text('Key Metrics', 20, yPosition);
      yPosition += 15;
      
      doc.setFontSize(12);
      const averageMood = checkins.reduce((sum, c) => sum + (c.moodRating || 0), 0) / checkins.length || 0;
      const participationRate = Math.round((checkins.length / users.length) * 100);
      
      doc.text(`Team Size: ${users.length} members`, 20, yPosition);
      yPosition += 8;
      doc.text(`Check-in Participation: ${participationRate}%`, 20, yPosition);
      yPosition += 8;
      doc.text(`Average Team Mood: ${averageMood.toFixed(1)}/5`, 20, yPosition);
      yPosition += 8;
      doc.text(`Total Wins Celebrated: ${wins.length}`, 20, yPosition);
      yPosition += 20;
      
      // Mood Trends
      doc.setFontSize(16);
      doc.text('Mood Trends', 20, yPosition);
      yPosition += 15;
      
      // Group checkins by week for trend analysis
      const weeklyMood: { [key: string]: number[] } = {};
      checkins.forEach(checkin => {
        const week = new Date(checkin.createdAt).toISOString().slice(0, 10);
        if (!weeklyMood[week]) weeklyMood[week] = [];
        if (checkin.moodRating) weeklyMood[week].push(checkin.moodRating);
      });
      
      doc.setFontSize(12);
      Object.entries(weeklyMood).slice(-4).forEach(([date, ratings]) => {
        const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
        doc.text(`${date}: ${avgRating.toFixed(1)}/5 (${ratings.length} responses)`, 20, yPosition);
        yPosition += 8;
      });
      
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Analytics PDF generation error:', error);
      throw new Error('Failed to generate analytics report');
    }
  }
}